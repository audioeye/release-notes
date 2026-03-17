/**
 * Parses a single Git commit message subject line into a clean, customer-facing
 * change description. Returns null if the commit should be skipped entirely
 * (merge commits, empty messages, etc.).
 */
export function parseCommitMessage(message: string): string | null {
  // Use only the subject line (first line of a potentially multi-line message)
  const subject = message.split('\n')[0].trim();
  if (!subject) return null;

  // Skip merge commits
  if (/^merge\b/i.test(subject)) return null;

  let clean = subject;

  // Remove markdown bold markers (__text__ and **text**)
  clean = clean.replace(/__/g, '').replace(/\*\*/g, '');

  // Remove markdown links [text](url) — keep label, drop URL
  clean = clean.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Remove bracketed content e.g. "[Services v2]", "[WIP]"
  clean = clean.replace(/\[[^\]]*\]/g, '');

  // Remove ticket prefix at the start: "IN-12345 | @author | " or "NOJIRA | "
  clean = clean.replace(
    /^(?:NOJIRA|NO-JIRA|[A-Z][A-Z0-9]+-\d+)\s*\|\s*(?:@[\w.-]+\s*\|\s*)*/gi,
    '',
  );

  // Remove inline JIRA-style ticket IDs anywhere in the text
  clean = clean.replace(/\bNO-?JIRA\b/gi, '');
  clean = clean.replace(/\b[A-Z][A-Z0-9]+-\d+\b/g, '');

  // Remove " by @author" patterns
  clean = clean.replace(/\s+by\s+@[\w.-]+(?:\s+and\s+@[\w.-]+)*/gi, '');

  // Remove PR references — "in #123", "in https://...", or "(#123)"
  clean = clean.replace(/\s+in\s+(?:#\d+|https?:\/\/\S+)/g, '');
  clean = clean.replace(/\s*\(#\d+\)/g, '');

  // Remove any remaining bare URLs
  clean = clean.replace(/https?:\/\/\S+/g, '');

  // Remove any remaining @mentions
  clean = clean.replace(/@[\w.-]+/g, '');

  // Clean up stray leading/trailing pipes, colons, and whitespace
  clean = clean.replace(/^[\s|:]+/, '').replace(/[\s|:]+$/, '').replace(/\s+/g, ' ').trim();

  // Skip if too short to be meaningful
  if (clean.length < 4) return null;

  return clean;
}

/**
 * Parses an array of raw commit messages and returns cleaned change descriptions,
 * filtering out skipped commits (merges, empty, etc.).
 */
export function parseCommitMessages(messages: string[]): string[] {
  return messages.flatMap((m) => {
    const parsed = parseCommitMessage(m);
    return parsed ? [parsed] : [];
  });
}
