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

// Returns the Monday of the ISO week containing the given date, as "YYYY-MM-DD"
function weekStartDate(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0 = Sun, 1 = Mon, …
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + daysToMonday),
  );
  return monday.toISOString().split('T')[0];
}

// Returns true once the full week (Mon–Sun) has passed
function isCompleteWeek(weekStart: string): boolean {
  const sunday = new Date(weekStart);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday < new Date();
}

function weekLabel(weekStart: string): string {
  return new Date(weekStart + 'T00:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

// Groups commits by weekStart only, merging all repos into a single entry per week
function groupByWeek(
  commits: RepoCommit[],
): Map<string, { weekStart: string; commits: RepoCommit[] }> {
  const groups = new Map<string, { weekStart: string; commits: RepoCommit[] }>();

  for (const commit of commits) {
    const ws = weekStartDate(commit.commit.author.date);
    if (!groups.has(ws)) {
      groups.set(ws, { weekStart: ws, commits: [] });
    }
    groups.get(ws)!.commits.push(commit);
  }

  // Sort newest week first
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

async function writeOutput(html: string, rss: string): Promise<void> {
  await fs.mkdir(config.paths.output, { recursive: true });
  await fs.writeFile(path.join(config.paths.output, 'index.html'), html);
  await fs.writeFile(path.join(config.paths.output, 'feed.xml'), rss);
}

function sinceDate(cached: ProcessedRelease[]): string {
  if (cached.length === 0) {
    // First run — limit history to six months to avoid processing everything
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
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

  const cached = await loadCache();
  const since = sinceDate(cached);
  const allCommits = await fetchAllCommits(since);

  const weekGroups = groupByWeek(allCommits);
  console.log(`Found ${allCommits.length} commits across ${weekGroups.size} week(s).`);

  // Only skip a week if it's fully complete AND already cached
  const cachedKeys = new Set(cached.map((r) => r.cacheKey));
  const processed: ProcessedRelease[] = [...cached.filter((r) => isCompleteWeek(r.id))];
  let newCount = 0;

  for (const [weekStart, group] of weekGroups) {
    const { commits: weekCommits } = group;

    // Skip complete weeks that are already cached
    if (isCompleteWeek(weekStart) && cachedKeys.has(weekStart)) continue;

    // Unique repos that contributed commits this week
    const repos = [...new Set(weekCommits.map((c) => `${c.owner}/${c.repo}`))];

    console.log(
      `\nProcessing week of ${weekStart} (${repos.join(', ')}) — ${weekCommits.length} commit(s)…`,
    );

    const rawChanges = parseCommitMessages(weekCommits.map((c) => c.commit.message));
    console.log(`  ${rawChanges.length} change(s) after filtering merge commits and cleaning.`);
    rawChanges.forEach((c) => console.log(`    - ${c}`));

    if (rawChanges.length === 0) {
      console.log('  Skipping — no customer-facing changes.');
      continue;
    }

    console.log(`  Generating notes…`);
    const generatedNotes = await generateReleaseNotes(rawChanges);

    if (!generatedNotes || generatedNotes === '_No notes generated._') {
      console.log('  Skipping — no notes generated.');
      continue;
    }

    // Most recent commit in the week is first (commits are sorted newest-first)
    const latestDate = weekCommits[0].commit.author.date;

    // Per-repo links to the commits view for this week
    const githubUrls = repos.map((slug) => {
      const c = weekCommits.find((wc) => `${wc.owner}/${wc.repo}` === slug)!;
      return `https://github.com/${c.owner}/${c.repo}/commits/${c.branch}`;
    });

    processed.push({
      cacheKey: weekStart,
      repos,
      id: weekStart,
      tag: weekStart,
      name: `Week of ${weekLabel(weekStart)}`,
      date: latestDate,
      rawChanges,
      generatedNotes,
      processedAt: new Date().toISOString(),
      githubUrls,
    });

    newCount++;
  }

  // Sort newest first across all repos
  processed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (newCount > 0) {
    await saveCache(processed);
    console.log(`\nCache updated with ${newCount} new week(s).`);
  }

  console.log('\nBuilding site…');
  const html = buildHtml(processed);
  const rss = buildRss(processed);
  await writeOutput(html, rss);

  console.log(`\nDone! Output written to ${config.paths.output}/`);
  console.log(`  index.html — ${processed.length} week(s)`);
  console.log(`  feed.xml   — RSS feed`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
