import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export const currentVersionBare = String(packageJson.version);
export const currentVersionPrefixed = `v${currentVersionBare}`;
export const currentVersionRegexEscaped = currentVersionPrefixed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const currentVersionBareRegexEscaped = currentVersionBare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const currentBrandingAssetNames = ['app-icon-192', 'app-icon-512', 'apple-touch-icon', 'favicon-32', 'favicon-16']
  .map(name => `${name}-${currentVersionPrefixed}.png`);

export function findHardCodedCurrentVersionLiterals(rootUrl = new URL('../', import.meta.url)) {
  const helperPath = fileURLToPath(import.meta.url);
  const matches = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:js|mjs|cjs)$/.test(entry.name) && path !== helperPath) {
        const source = readFileSync(path, 'utf8');
        if (source.includes(currentVersionPrefixed) || source.includes(currentVersionBare)) matches.push(path);
      }
    }
  };
  visit(fileURLToPath(rootUrl));
  return matches;
}
