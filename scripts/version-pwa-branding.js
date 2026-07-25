import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const release = process.argv[2];
if (!/^v\d+\.\d+\.\d+$/.test(release || '')) {
  throw new Error('Usage: node scripts/version-pwa-branding.js vXX.X.XX');
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brandingDir = path.join(root, 'branding');
const assets = [
  ['app-icon-192.png', `app-icon-192-${release}.png`],
  ['app-icon-512.png', `app-icon-512-${release}.png`],
  ['apple-touch-icon.png', `apple-touch-icon-${release}.png`],
  ['favicon-32.png', `favicon-32-${release}.png`],
  ['favicon-16.png', `favicon-16-${release}.png`],
];

for (const [sourceName, targetName] of assets) {
  const source = path.join(brandingDir, sourceName);
  const target = path.join(brandingDir, targetName);
  if (!existsSync(source)) throw new Error(`Missing canonical branding asset: ${sourceName}`);
  copyFileSync(source, target);
}

console.log(`Created ${assets.length} immutable branding assets for ${release}.`);
