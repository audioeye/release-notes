import { config } from './config.js';
import type { GitHubCommit } from './types.js';

async function fetchPage(
  owner: string,
  repo: string,
  branch: string,
  page: number,
  since?: string,
  perPage = 100,
): Promise<GitHubCommit[]> {
  const sinceParam = since ? `&since=${encodeURIComponent(since)}` : '';
  const url = `https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&page=${page}&per_page=${perPage}${sinceParam}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `token ${config.github.token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'release-notes-generator',
    },
  });

  if (response.status === 401) throw new Error('GitHub token is invalid or expired.');
  if (response.status === 403) throw new Error('GitHub token lacks repo access, or rate limit hit.');
  if (response.status === 404)
    throw new Error(`Repo ${owner}/${repo} not found, or branch "${branch}" doesn't exist.`);
  if (!response.ok) throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);

  return response.json() as Promise<GitHubCommit[]>;
}

export interface RepoCommit extends GitHubCommit {
  owner: string;
  repo: string;
  branch: string;
}

async function fetchAllFromRepo(
  owner: string,
  repo: string,
  branch: string,
  since?: string,
): Promise<RepoCommit[]> {
  const all: RepoCommit[] = [];
  let page = 1;

  while (true) {
    const commits = await fetchPage(owner, repo, branch, page, since);
    if (commits.length === 0) break;
    all.push(...commits.map((c) => ({ ...c, owner, repo, branch })));
    if (commits.length < 100) break;
    page++;
  }

  return all;
}

export async function fetchAllCommits(since?: string): Promise<RepoCommit[]> {
  const results = await Promise.all(
    config.github.repos.map(async ({ owner, repo, branch }) => {
      const label = since ? `since ${since.slice(0, 10)}` : 'all history';
      console.log(`  Fetching commits from ${owner}/${repo}@${branch} (${label})…`);
      return fetchAllFromRepo(owner, repo, branch, since);
    }),
  );

  // Merge and sort newest first across all repos
  return results
    .flat()
    .sort(
      (a, b) =>
        new Date(b.commit.author.date).getTime() - new Date(a.commit.author.date).getTime(),
    );
}
