import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

const SYSTEM_PROMPT = `You are a technical writer creating customer-facing release notes for a web accessibility platform.

You will receive a numbered list of internal change descriptions. Your job is to:
1. Rewrite them in clear, customer-friendly language — focus on user impact, avoid internal jargon
2. Group related changes under concise category headings (e.g. "Bug Fixes", "Improvements", "New Features")
3. Return valid Markdown only — no preamble, no explanation
4. Always use ### (h3) for category headings — never use # or ##

If there is only one change or all changes are the same type, a single ### Changes heading is fine.
Keep each bullet to one sentence. Do not add detail that wasn't in the original descriptions.`;

const MAX_RETRIES = 3;

export async function generateReleaseNotes(changes: string[]): Promise<string> {
  if (changes.length === 0) {
    return '_No customer-facing changes in this release._';
  }

  const client = new Anthropic({ apiKey: config.anthropic.apiKey });
  const userMessage = changes.map((c, i) => `${i + 1}. ${c}`).join('\n');

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // max_tokens must cover both thinking blocks and the text response.
      // Adaptive thinking can silently consume a large share of the budget,
      // so 4096 gives enough headroom for even busy weeks.
      const stream = client.messages.stream({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        thinking: { type: 'adaptive' },
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      });

      const message = await stream.finalMessage();

      // Thinking blocks are internal — extract only the text response
      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return text.trim() || '_No notes generated._';
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
