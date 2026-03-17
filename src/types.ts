export interface GitHubCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string; // ISO 8601
    };
  };
  html_url: string;
  author: { login: string } | null; // GitHub user (may be null for unlinked authors)
}

export interface ProcessedRelease {
  // Week start date "YYYY-MM-DD" — unique per week, shared across all repos
  cacheKey: string;
  repos: string[];      // e.g. ["audioeye/services-v2", "audioeye/a11y-testing"]
  id: string;           // week start date e.g. "2026-03-09"
  tag: string;          // same as id, used by buildSite
  name: string;         // human-readable e.g. "Week of March 9, 2026"
  date: string;         // ISO date of the most recent commit in the week
  rawChanges: string[];
  generatedNotes: string;
  processedAt: string;
  githubUrls: string[]; // per-repo links to the commits list for that week
}
