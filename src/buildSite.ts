import { marked, Renderer } from 'marked';
import { config } from './config.js';
import type { ProcessedRelease } from './types.js';

// Force all headings inside release notes to <h3> regardless of the markdown
// level the model produces, so the page heading hierarchy stays consistent:
//   <h1>  site title
//   <h2>  release date
//   <h3>  category (Bug Fixes, Improvements, …)
const notesRenderer = new Renderer();
notesRenderer.heading = ({ text }) => `<h3>${text}</h3>\n`;

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function toRfc822(dateStr: string): string {
  return new Date(dateStr).toUTCString();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildHtml(releases: ProcessedRelease[]): string {
  const { title, description, baseUrl } = config.site;

  const releaseItems = releases
    .map((release) => {
      const html = marked.parse(release.generatedNotes, { renderer: notesRenderer }) as string;
      const formattedDate = formatDate(release.date);
      return `
    <article class="release">
      <h2 class="release-date">${escapeXml(formattedDate)}</h2>
      <div class="release-notes">${html}</div>
    </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeXml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="alternate" type="application/rss+xml" title="${escapeXml(title)}" href="${baseUrl}/feed.xml" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --color-bg: #ffffff;
      --color-surface: #f4f4f4;
      --color-border: #ebebeb;
      --color-text: #212121;
      --color-muted: #6c758e;
      --color-accent: #602ecc;
      --color-accent-dark: #4a1fa8;
      --color-accent-light: #f3eeff;
      --font: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --max-width: 740px;
    }

    body {
      font-family: var(--font);
      background: var(--color-bg);
      color: var(--color-text);
      line-height: 1.6;
      padding: 0 1rem;
      /* Thin purple brand bar across the very top */
      border-top: 4px solid var(--color-accent);
    }

    /* ── Page header ─────────────────────────────────── */
    header {
      max-width: var(--max-width);
      margin: 1.25rem auto 2.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--color-border);
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }

    header h1 {
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: var(--color-text);
    }

    header p {
      color: var(--color-muted);
      margin-top: 0.3rem;
      font-size: 0.95rem;
    }

    /* ── RSS subscribe button ────────────────────────── */
    .rss-link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: var(--color-accent);
      text-decoration: none;
      padding: 0.45rem 0.9rem;
      border: 1.5px solid var(--color-accent);
      border-radius: 6px;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
      margin-top: 0.25rem;
    }

    .rss-link:hover {
      background: var(--color-accent);
      color: #ffffff;
    }

    /* ── Release entries ─────────────────────────────── */
    main {
      max-width: var(--max-width);
      margin: 0 auto 4rem;
    }

    .release {
      padding: 2rem 0;
      border-bottom: 1px solid var(--color-border);
    }

    .release:last-child {
      border-bottom: none;
    }

    .release-date {
      font-size: 1.1rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--color-text);
      margin-bottom: 1rem;
    }

    /* Category labels — match AudioEye's uppercase spaced-out label style */
    .release-notes h3 {
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-accent);
      margin: 1.4rem 0 0.5rem;
    }

    .release-notes h3:first-child {
      margin-top: 0;
    }

    .release-notes ul {
      padding-left: 1.25rem;
    }

    .release-notes li {
      margin-bottom: 0.4rem;
      font-size: 0.95rem;
      color: var(--color-text);
    }

    .release-notes p {
      font-size: 0.95rem;
      color: var(--color-muted);
    }

    /* ── Footer ──────────────────────────────────────── */
    footer {
      max-width: var(--max-width);
      margin: 0 auto 2rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--color-border);
      font-size: 0.8rem;
      color: var(--color-muted);
      text-align: center;
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeXml(title)}</h1>
      <p>${escapeXml(description)}</p>
    </div>
    <a class="rss-link" href="${baseUrl}/feed.xml">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
      </svg>
      Subscribe via RSS
    </a>
  </header>
  <main>
    ${releaseItems || '<p style="color:var(--color-muted)">No releases yet.</p>'}
  </main>
  <footer>
    Updated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </footer>
</body>
</html>`;
}

export function buildRss(releases: ProcessedRelease[]): string {
  const { title, description, baseUrl } = config.site;

  const items = releases
    .map((release) => {
      const html = marked.parse(release.generatedNotes, { renderer: notesRenderer }) as string;
      const itemUrl = `${baseUrl}/#${release.tag}`;
      return `    <item>
      <title>${escapeXml(release.name)}</title>
      <link>${escapeXml(itemUrl)}</link>
      <guid isPermaLink="false">${escapeXml(`${baseUrl}/releases/${release.tag}`)}</guid>
      <pubDate>${toRfc822(release.date)}</pubDate>
      <description><![CDATA[${html}]]></description>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${toRfc822(new Date().toISOString())}</lastBuildDate>
    <atom:link href="${escapeXml(`${baseUrl}/feed.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>`;
}
