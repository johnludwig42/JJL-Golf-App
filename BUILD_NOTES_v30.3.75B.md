# v30.3.75B — Developer Infrastructure Cleanup

## Problem and root cause

The committed npm lockfile resolved 86 package tarballs through `packages.applied-caas-gateway1.internal.api.openai.org/artifactory`. Those URLs are unavailable to normal developer machines even when npm is correctly configured for `https://registry.npmjs.org/`, causing non-portable installs and timeout failures.

## Files changed

- `package-lock.json`: replaced only the internal registry base on 86 `resolved` values with `https://registry.npmjs.org/`.
- `BUILD_NOTES_v30.3.75B.md`: records the maintenance change and validation.

`package.json` and all application source files are unchanged.

## Technical approach

The committed lockfile remained the dependency authority. An npm lockfile-only refresh preserved the internal URLs, while a clean temporary npm regeneration selected four newer packages and was therefore rejected. A deterministic base-URL transformation retained every package key, version, integrity hash, and dependency field while changing only tarball origins.

Machine-readable before/after comparison confirmed:

- 87 lockfile package entries before and after.
- Zero package version changes.
- Zero packages added or removed.
- Zero integrity changes.
- Internal gateway/artifactory references reduced from 86 to zero.
- All 86 resolved tarballs now use the public npm registry.

## Installation and validation

`npm ci --registry=https://registry.npmjs.org/` completed successfully from a removed `node_modules` baseline, installed 86 packages, reported zero vulnerabilities, and did not change `package.json` or `package-lock.json`.

- `npm test`: passed, 219/219 tests.
- `npm run validate`: passed.
- `npm run release:sanity`: passed with expected dirty-tree/build-target warnings and zero failures.
- `npm run simulate`: passed with zero simulation failures or live/mirror differences.
- `npm run simulate:compare`: passed with zero simulation failures or live/mirror differences.
- `npm run simulate:100`: passed with zero simulation failures or live/mirror differences.
- `npm run lint`: existing source/configuration baseline failed with 9 errors and 163 warnings. The failures are unrelated to dependency resolution and were not changed in this infrastructure-only release.

No `build`, `test:unit`, `test:integration`, or `test:simulation` script exists in `package.json`.

## Production impact

- No production application behavior changed.
- No Supabase project was linked.
- No database migration was run.
- No RLS policy was changed.
- No production data was touched.

## Rollback

Reverting `package-lock.json` and this build note restores the prior repository state. That rollback would also reintroduce the internal, non-portable package URLs and should be used only if a lockfile-specific regression is discovered.
