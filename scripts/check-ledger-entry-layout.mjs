#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { createServer } from 'node:http';
import puppeteer from 'puppeteer-core';

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const chrome = candidates.find(existsSync);
if (!chrome) {
  console.error('No Chrome found. Set CHROME_PATH. Exit 2 means UNVERIFIED, not passed.');
  process.exit(2);
}

const input = resolve(process.argv[2] || 'reports/ledger-entry-v31.0.02-reference.html');
const output = resolve(process.argv[3] || 'reports/ledger-entry-v31.0.02-reference.pdf');
const iosPrint = process.argv.includes('--ios');
if (!existsSync(input)) {
  console.error(`Not found: ${input}`);
  process.exit(2);
}

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, timeout: 60000, protocolTimeout: 120000, args: ['--font-render-hinting=none', '--disable-gpu', '--disable-software-rasterizer', '--disable-dev-shm-usage', '--no-sandbox'] });
const root = resolve('.');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png' };
const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname).replace(/^\/+/, '');
    const file = resolve(root, pathname);
    if (!file.toLowerCase().startsWith(root.toLowerCase())) throw new Error('outside root');
    response.writeHead(200, { 'Content-Type': contentTypes[extname(file).toLowerCase()] || 'application/octet-stream' });
    response.end(readFileSync(file));
  } catch {
    if (!response.headersSent) response.writeHead(404);
    if (!response.writableEnded) response.end('Not found');
  }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
if (iosPrint) {
  await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
}
const errors = [];
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', error => errors.push(`PAGE ERROR: ${error.message}`));
const inputPath = input.slice(root.length).replaceAll('\\', '/').replace(/^\/+/, '');
await page.goto(`http://127.0.0.1:${address.port}/${inputPath}`, { waitUntil: 'load', timeout: 60000 });
await page.evaluate(() => document.fonts?.ready);
await page.waitForSelector('.page', { timeout: 60000 });
await new Promise(resolveWait => setTimeout(resolveWait, 400));

const audit = await page.evaluate(() => {
  const playerLabels = [...document.querySelectorAll('[data-player-label]')].map(label => {
    const box = label.getBoundingClientRect();
    return { id: label.getAttribute('data-player-label'), text: label.textContent.trim(), top: box.top, bottom: box.bottom, color: getComputedStyle(label).fill };
  });
  const pages = [...document.querySelectorAll('.page')].map((pageNode, index) => {
    const flow = pageNode.querySelector('.flow');
    const last = flow?.lastElementChild;
    const used = last && flow ? Math.ceil(last.getBoundingClientRect().bottom - flow.getBoundingClientRect().top) : 0;
    return {
      index: index + 1,
      label: pageNode.querySelector('.wordmark em')?.textContent?.trim() || 'Result',
      overflow: flow ? used - flow.clientHeight : 0,
      headroom: flow ? flow.clientHeight - used : 0,
      horizontalOverflow: pageNode.scrollWidth > pageNode.clientWidth + 1,
      statisticFragments: [...pageNode.querySelectorAll('[data-ledger-stat-category]')].map(category => ({
        id: category.getAttribute('data-ledger-stat-category'),
        rows: category.querySelectorAll('[data-row]').length,
      })),
    };
  });
  return {
    title: document.title,
    pages,
    labels: [...new Set(pages.map(page => page.label))],
    headings: [...document.querySelectorAll('.sechead')].map(node => node.textContent.trim()),
    fonts: [...document.fonts].map(font => font.family),
    ninePoint: {
      table: !!document.querySelector('[data-nine-point-hole-table]'),
      lines: [...document.querySelectorAll('[data-player-line]')].map(line => ({ id: line.getAttribute('data-player-line'), color: line.getAttribute('stroke') })),
      labels: playerLabels,
      topThreeNote: document.body.textContent.includes('TOP THREE EMPHASISED'),
    },
  };
});

let failed = false;
const expectedLabels = ['Result', 'Round story', 'Leaderboards', 'Games', 'Statistics', 'Appendix'];
if (JSON.stringify(audit.labels) !== JSON.stringify(expectedLabels)) {
  console.error(`Subject order mismatch: ${audit.labels.join(', ')}`); failed = true;
}
if (!audit.headings.some(heading => heading.startsWith('Highlights'))) { console.error('Highlights missing from cover.'); failed = true; }
if (!audit.headings.some(heading => heading.startsWith('Appendix · Course net')) || !audit.headings.some(heading => heading.startsWith('Appendix · Featured net'))) { console.error('Both scorecard appendices are required.'); failed = true; }
if (audit.pages.some(pageRow => pageRow.horizontalOverflow)) { console.error('Horizontal overflow detected.'); failed = true; }
const orphanedStatFragments = audit.pages.flatMap(pageRow => pageRow.statisticFragments.map(fragment => ({ ...fragment, page: pageRow.index }))).filter(fragment => fragment.rows === 1);
if (orphanedStatFragments.length) { console.error(`Single-player statistics fragments detected: ${orphanedStatFragments.map(row => `${row.id} on page ${row.page}`).join(', ')}`); failed = true; }
const overflows = audit.pages.filter(pageRow => pageRow.overflow > 1);
if (overflows.length) { console.error(`Page overflow detected: ${overflows.map(row => `${row.index} (+${row.overflow}px)`).join(', ')}`); failed = true; }
for (const family of ['Archivo', 'Inter', 'IBM Plex Mono']) {
  if (!audit.fonts.some(font => font.includes(family))) { console.error(`${family} did not load.`); failed = true; }
}
if (errors.length) { console.error(`Console errors:\n${errors.join('\n')}`); failed = true; }
if (basename(input).includes('nine-point')) {
  const uniqueColors = new Set(audit.ninePoint.lines.map(line => line.color));
  const overlappingLabels = audit.ninePoint.labels.some((label, index, labels) => labels.slice(index + 1).some(other => label.top < other.bottom && other.top < label.bottom));
  if (!audit.ninePoint.table) { console.error('9-Point hole-by-hole table missing.'); failed = true; }
  if (audit.ninePoint.lines.length !== 3 || uniqueColors.size !== 3) { console.error('9-Point player lines are not uniquely colored.'); failed = true; }
  if (audit.ninePoint.labels.length !== 3 || audit.ninePoint.labels.some(label => !label.text)) { console.error('9-Point direct player labels missing.'); failed = true; }
  if (overlappingLabels) { console.error('9-Point end labels overlap.'); failed = true; }
  if (audit.ninePoint.topThreeNote) { console.error('Small-field 9-Point chart retained the top-three footnote.'); failed = true; }
}

console.log(`${basename(input)} — Chrome ${await browser.version()}`);
console.log(`${audit.pages.length} pages; ${audit.labels.length} ordered subjects; bundled fonts loaded.`);
console.log(`Statistics pages: ${audit.pages.filter(row => row.label === 'Statistics').map(row => `${row.index} (${Math.max(0, row.headroom)}px headroom; ${row.statisticFragments.map(fragment => fragment.id).join(', ') || 'heading'})`).join(', ') || 'none'}.`);
if (!failed) {
  await page.emulateMediaType('print');
  const pdf = await page.pdf({ path: output, format: 'letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  const physicalPages = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  if (physicalPages !== audit.pages.length) {
    console.error(`Physical PDF page mismatch: ${physicalPages} sheets for ${audit.pages.length} designed pages${iosPrint ? ' on the iOS print surface' : ''}.`);
    failed = true;
  }
  console.log(`Wrote ${output}`);
}
await browser.close();
await new Promise(resolveClose => server.close(resolveClose));
if (failed) process.exit(1);
console.log('Layout acceptance passed.');
