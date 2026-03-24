import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

function systemPromptForRepo(repoShortName: string): string {
  return `You are a technical writer creating customer-facing release notes for a web accessibility platform.

You are writing ONLY for the repository "${repoShortName}" (changes from other repos are handled separately).

You will receive a numbered list of internal change descriptions for this repository. Your job is to:
1. Rewrite them in clear, customer-friendly language — focus on user impact, avoid internal jargon
2. Ignore changes that are not customer-facing (e.g. "fix: update README", "chore: update dependencies", "refactor: improve code readability")
3. Group changes under concise category headings using ### (e.g. "Bug Fixes", "Improvements", "New Features")
4. Return valid Markdown only — no preamble, no explanation
5. Use ### for category headings only — do not use # or ## (the repository title is added separately)
6. Keep camelCase words in the output as is (e.g. "setDescribedBy").

If there is only one change or all changes are the same type, a single ### Changes heading is fine.
Keep each bullet to one sentence. Do not add detail that wasn't in the original descriptions.

Some extra information on our internal acronyms:
- RTE: Real Time Effects
- i18n: Internationalization
- OSS: On-Site Scanner
`;
}

const MAX_RETRIES = 3;

/**
 * Generates markdown for one repo's changes. The caller should prefix the release
 * article date (see buildSite); this output starts with ## {repo} then ### categories.
 */
export async function generateReleaseNotes(
  changes: string[],
  repoShortName: string,
): Promise<string> {
  if (changes.length === 0) {
    return '_No customer-facing changes in this release._';
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const userMessage = changes.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const system = systemPromptForRepo(repoShortName);

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // budget_tokens controls how much of the 4096 max_tokens Claude can use
      // for internal reasoning; the remainder goes to the visible text response.
      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        thinking: { type: 'enabled', budget_tokens: 2048 },
        system,
        messages: [{ role: 'user', content: userMessage }],
      });

      const message = await stream.finalMessage();

      // Thinking blocks are internal — extract only the text response
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      const body = text.trim();
      if (!body) return '_No notes generated._';
      return `## ${repoShortName}\n\n${body}`;
    } catch (err: unknown) {
      lastError = err;

      // Determine whether this is a transient server-side error worth retrying.
      // The SDK throws Anthropic.APIError instances; fall back to message sniffing
      // in case the error is surfaced as a plain Error with a JSON body.
      const isRetryable =
        (err instanceof Anthropic.APIError && (err.status === 500 || err.status === 529)) ||
        (err instanceof Error && /internal server error|overloaded/i.test(err.message));

      if (isRetryable) {
        const delay = attempt * 5000;
        console.warn(
          `  Anthropic API error (attempt ${attempt}/${MAX_RETRIES}), retrying in ${delay / 1000}s…`,
        );
        await new Promise((res) => setTimeout(res, delay));
        continue;
      }

      // Non-retryable error — rethrow immediately
      throw err;
    }
  }

  throw lastError;
}
