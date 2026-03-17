/**
 * Generates a sample output/index.html using mock data so the design
 * can be validated locally without needing real API credentials.
 */
import fs from 'fs/promises';
import path from 'path';
import 'dotenv/config';
import { buildHtml, buildRss } from '../src/buildSite.js';
import type { ProcessedRelease } from '../src/types.js';

const SAMPLE_RELEASES: ProcessedRelease[] = [
  {
    cacheKey: '2026-03-10',
    repos: ['audioeye/services-v2', 'audioeye/a11y-testing'],
    id: '2026-03-10',
    tag: '2026-03-10',
    name: 'Week of March 10, 2026',
    date: '2026-03-10T12:00:00Z',
    rawChanges: [
      'Fix invalid selector query crash in site-menu and carousel',
      'Keep OSS control buttons visible in mobile maximized view',
      'Check in localizations to codebase',
      'Fix the logic of loading RTE',
      'Add support for ARIA landmark detection in shadow DOM',
    ],
    generatedNotes: `### Bug Fixes

- Fixed a crash caused by an invalid selector query in the site menu and carousel components.
- Resolved an issue where on-screen support buttons were hidden in mobile maximized view.

### Improvements

- Localization files are now checked into the codebase for easier management.
- Improved the logic for loading the rich text editor to ensure consistent behavior.
- Added detection of ARIA landmark roles inside shadow DOM elements.`,
    processedAt: new Date().toISOString(),
    githubUrls: [
      'https://github.com/audioeye/services-v2/commits/staging',
      'https://github.com/audioeye/a11y-testing/commits/main',
    ],
  },
  {
    cacheKey: '2026-03-03',
    repos: ['audioeye/services-v2'],
    id: '2026-03-03',
    tag: '2026-03-03',
    name: 'Week of March 3, 2026',
    date: '2026-03-03T12:00:00Z',
    rawChanges: [
      'Improve contrast ratio calculation for semi-transparent backgrounds',
    ],
    generatedNotes: `### Improvements

- Contrast ratio calculations now correctly account for semi-transparent background colors.`,
    processedAt: new Date().toISOString(),
    githubUrls: ['https://github.com/audioeye/services-v2/commits/staging'],
  },
];

const outputDir = './output';
await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'index.html'), buildHtml(SAMPLE_RELEASES));
await fs.writeFile(path.join(outputDir, 'feed.xml'), buildRss(SAMPLE_RELEASES));
console.log('Sample output written to ./output/');
