import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { config } from './config.js';
import { fetchAllCommits } from './fetchCommits.js';
import { parseCommitMessages } from './parseChangelog.js';
import { generateReleaseNotes } from './generateNotes.js';
import { buildHtml, buildRss } from './buildSite.js';
import type { ProcessedRelease } from './types.js';
import type { RepoCommit } from './fetchCommits.js';

const CACHE_FILE = path.join(config.paths.data, 'releases.json');
const NO_CUSTOMER_FACING_TEXT = /no customer-facing changes/i;

// UTC calendar day of the commit author timestamp, "YYYY-MM-DD"
function utcCalendarDay(dateStr: string): string {
  return new Date(dateStr).toISOString().split('T')[0];
}

// True once the entire UTC calendar day has ended (so we can freeze cache for that day)
function isCompleteDay(dayKey: string): boolean {
  const endUtc = new Date(`${dayKey}T23:59:59.999Z`);
  return endUtc < new Date();
}

function calendarDayLabel(dayKey: string): string {
  return new Date(`${dayKey}T00:00:00Z`).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// One release entry per UTC calendar day (commits grouped by author date)
function groupByDay(commits: RepoCommit[]): Map<string, RepoCommit[]> {
  const groups = new Map<string, RepoCommit[]>();

  for (const commit of commits) {
    const day = utcCalendarDay(commit.commit.author.date);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(commit);
  }

  for (const [, dayCommits] of groups) {
    dayCommits.sort(
      (a, b) =>
        new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime(),
    );
  }

  return new Map([...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

async function loadCache(): Promise<ProcessedRelease[]> {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(raw) as ProcessedRelease[];
  } catch {
    return [];
  }
}

async function saveCache(releases: ProcessedRelease[]): Promise<void> {
  await fs.mkdir(config.paths.data, { recursive: true });
  await fs.writeFile(CACHE_FILE, JSON.stringify(releases, null, 2));
}

function stripNoCustomerFacingSections(notes: string): string {
  const trimmed = notes.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('## ')) {
    const sections = trimmed.split(/\n(?=##\s)/g);
    const kept = sections.filter((section) => !NO_CUSTOMER_FACING_TEXT.test(section));
    return kept.join('\n\n').trim();
  }

  if (
    NO_CUSTOMER_FACING_TEXT.test(trimmed) ||
    trimmed === '_No customer-facing changes in this release._' ||
    trimmed === '_No notes generated._'
  ) {
    return '';
  }

  return trimmed;
}

function pruneRelease(release: ProcessedRelease): ProcessedRelease | null {
  const cleanedNotes = stripNoCustomerFacingSections(release.generatedNotes);
  if (!cleanedNotes) return null;

  return {
    ...release,
    generatedNotes: cleanedNotes,
  };
}

async function writeOutput(html: string, rss: string): Promise<void> {
  await fs.mkdir(config.paths.output, { recursive: true });
  await fs.writeFile(path.join(config.paths.output, 'index.html'), html);
  await fs.writeFile(path.join(config.paths.output, 'feed.xml'), rss);
}

function sinceDate(cached: ProcessedRelease[]): string {
  if (cached.length === 0) {
    // First run — limit history to six months to avoid processing everything
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 3);
    return sixMonthsAgo.toISOString();
  }
  // Incremental — fetch only commits newer than the latest one already processed
  const latestDate = cached.reduce(
    (max, r) => (r.date > max ? r.date : max),
    cached[0].date,
  );
  return latestDate;
}

async function main() {
  const repoList = config.github.repos.map((r) => `${r.owner}/${r.repo}@${r.branch}`).join(', ');
  console.log(`Fetching commits from: ${repoList}`);

  const cached = (await loadCache()).flatMap((r) => {
    const pruned = pruneRelease(r);
    return pruned ? [pruned] : [];
  });
  const since = sinceDate(cached);
  const allCommits = await fetchAllCommits(since);

  const dayGroups = groupByDay(allCommits);
  console.log(`Found ${allCommits.length} commits across ${dayGroups.size} UTC day(s).`);

  // Drop in-progress UTC days so they are regenerated on each run; keep frozen days from cache
  const cachedKeys = new Set(cached.map((r) => r.cacheKey));
  const processed: ProcessedRelease[] = [...cached.filter((r) => isCompleteDay(r.id))];
  let newCount = 0;

  for (const [dayKey, dayCommits] of dayGroups) {
    // Skip complete days that are already cached
    if (isCompleteDay(dayKey) && cachedKeys.has(dayKey)) continue;

    const repos = [...new Set(dayCommits.map((c) => `${c.owner}/${c.repo}`))];

    console.log(
      `\nProcessing ${dayKey} (${calendarDayLabel(dayKey)}) — ${repos.join(', ')} — ${dayCommits.length} commit(s)…`,
    );

    const reposWithCommits = new Set(dayCommits.map((c) => `${c.owner}/${c.repo}`));
    const repoSections: string[] = [];
    const rawChanges: string[] = [];

    for (const { owner, repo } of config.github.repos) {
      const slug = `${owner}/${repo}`;
      if (!reposWithCommits.has(slug)) continue;

      const repoCommits = dayCommits.filter((c) => c.owner === owner && c.repo === repo);
      const repoParsed = parseCommitMessages(repoCommits.map((c) => c.commit.message));
      if (repoParsed.length === 0) continue;

      console.log(`  ${repo}: ${repoParsed.length} change(s) after filtering — generating notes…`);
      repoParsed.forEach((c) => console.log(`    - ${c}`));

      const section = await generateReleaseNotes(repoParsed, repo);
      if (!section || section === '_No notes generated._') {
        console.log(`    Skipping ${repo} — no notes generated.`);
        continue;
      }
      repoSections.push(section);
      rawChanges.push(...repoParsed);
    }

    if (repoSections.length === 0) {
      console.log('  Skipping — no customer-facing changes or no notes generated.');
      continue;
    }

    const generatedNotes = repoSections.join('\n\n');

    const latestDate = dayCommits[0].commit.author.date;

    const githubUrls = repos.map((slug) => {
      const c = dayCommits.find((wc) => `${wc.owner}/${wc.repo}` === slug)!;
      return `https://github.com/${c.owner}/${c.repo}/commits/${c.branch}`;
    });

    const nextRelease: ProcessedRelease = {
      cacheKey: dayKey,
      repos,
      id: dayKey,
      tag: dayKey,
      name: calendarDayLabel(dayKey),
      date: latestDate,
      rawChanges,
      generatedNotes,
      processedAt: new Date().toISOString(),
      githubUrls,
    };

    const pruned = pruneRelease(nextRelease);
    if (!pruned) {
      console.log('  Skipping — notes resolved to no customer-facing content.');
      continue;
    }

    processed.push(pruned);

    newCount++;
  }

  // Sort newest first across all repos
  processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (newCount > 0) {
    await saveCache(processed);
    console.log(`\nCache updated with ${newCount} new day(s).`);
  }

  console.log('\nBuilding site…');
  const html = buildHtml(processed);
  const rss = buildRss(processed);
  await writeOutput(html, rss);

  console.log(`\nDone! Output written to ${config.paths.output}/`);
  console.log(`  index.html — ${processed.length} release day(s)`);
  console.log(`  feed.xml   — RSS feed`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
