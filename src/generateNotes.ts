import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a technical writer creating customer-facing release notes for a web accessibility platform.

You will receive a numbered list of internal change descriptions. Your job is to:
1. Rewrite them in clear, customer-friendly language — focus on user impact, avoid internal jargon
2. Group related changes under concise category headings (e.g. "Bug Fixes", "Improvements", "New Features")
3. Return valid Markdown only — no preamble, no explanation
4. Always use ### (h3) for category headings — never use # or ##

If there is only one change or all changes are the same type, a single ### Changes heading is fine.
Keep each bullet to one sentence. Do not add detail that wasn't in the original descriptions.`;

export async function generateReleaseNotes(changes: string[]): Promise<string> {
  if (changes.length === 0) {
    return '_No customer-facing changes in this release._';
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userMessage = changes.map((c, i) => `${i + 1}. ${c}`).join('\n');

  // Stream the response — adaptive thinking on Opus 4.6 can produce long outputs
  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 1024,
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
}
