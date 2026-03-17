function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Environment variable ${name} is required. See .env.example.`);
  return val;
}

function parseRepos(): Array<{ owner: string; repo: string; branch: string }> {
  const defaultBranch = process.env.GITHUB_BRANCH ?? 'main';
  const raw = process.env.GITHUB_REPOS;

  if (raw) {
    // Accept newline- or comma-separated GitHub repo URLs or owner/repo slugs,
    // with an optional @branch suffix to override the branch per-repo.
    // e.g. https://github.com/audioeye/services-v2@staging
    //      audioeye/a11y-testing@main
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        // Split off optional @branch suffix before parsing the URL/slug
        const [repoEntry, branchOverride] = entry.split('@');
        const match = repoEntry.match(/(?:github\.com\/)?([^/\s]+)\/([^/\s]+?)\s*$/);
        if (!match) throw new Error(`Cannot parse repo from: "${entry}"`);
        return {
          owner: match[1],
          repo: match[2],
          branch: branchOverride?.trim() || defaultBranch,
        };
      });
  }

  // Fall back to legacy single-repo env vars
  return [
    {
      owner: process.env.GITHUB_OWNER ?? 'audioeye',
      repo: process.env.GITHUB_REPO ?? required('GITHUB_REPOS'),
      branch: defaultBranch,
    },
  ];
}

export const config = {
  github: {
    token: process.env.GITHUB_TOKEN ?? required('GITHUB_TOKEN'),
    repos: parseRepos(),
    // Per-repo branches are set via the @branch suffix in GITHUB_REPOS.
    // GITHUB_BRANCH sets the fallback for any repo without an explicit @branch.
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? required('ANTHROPIC_API_KEY'),
  },
  site: {
    title: process.env.SITE_TITLE ?? 'Release Notes',
    description: process.env.SITE_DESCRIPTION ?? 'Latest updates and improvements',
    baseUrl: (process.env.SITE_BASE_URL ?? 'https://releases.example.com').replace(/\/$/, ''),
  },
  paths: {
    output: process.env.OUTPUT_DIR ?? './output',
    data: process.env.DATA_DIR ?? './data',
  },
};
