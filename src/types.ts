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
  /** UTC calendar day "YYYY-MM-DD" — unique per day, shared across repos */
  cacheKey: string;
  repos: string[]; // e.g. ["audioeye/services-v2", "audioeye/a11y-testing"]
  id: string; // same as cacheKey
  tag: string; // fragment id / RSS anchor
  name: string; // human-readable UTC calendar date e.g. "March 9, 2026"
  /** ISO timestamp of the newest commit on this release day (RSS pubDate, ordering) */
  date: string;
  /** Parsed commit subjects for this day, in configured repo order (repos with generated sections only). */
  rawChanges: string[];
  /** Markdown: ## repo, then ### categories per repo; article date is the surrounding <h2>. */
  generatedNotes: string;
  processedAt: string;
  githubUrls: string[];
}
