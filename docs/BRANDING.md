# The Dye Ledger Branding

## Canonical identity

The installed iPhone / Home Screen / PWA artwork is the canonical application identity. The master file is [`branding/app-icon-master.png`](../branding/app-icon-master.png), a 512 × 512 PNG carried forward from the approved v4 installed-app artwork. Do not redraw, reinterpret, crop, recolor, or add a second header mark.

The master depicts the gold ledger/flag mark above the white **THE DYE LEDGER** wordmark with the existing golf illustrations on a dark green field.

## Asset usage

| Surface | Asset | Required size |
| --- | --- | ---: |
| Canonical source | `branding/app-icon-master.png` | 512 × 512 |
| PWA / installed application | `branding/app-icon-512.png` | 512 × 512 |
| PWA / header | `branding/app-icon-192.png` | 192 × 192 |
| iPhone Home Screen | `branding/apple-touch-icon.png` | 180 × 180 |
| Browser favicon | `branding/favicon-32.png` | 32 × 32 |
| Small browser favicon | `branding/favicon-16.png` | 16 × 16 |

`index.html` uses the 192 px asset in the header, the Apple Touch Icon for iOS, and both favicon sizes. `manifest.json` uses the 192 px, 512 px, and 180 px assets. `service-worker.js` caches the same set for offline-first startup.

The app has no separate hand-authored splash artwork. Installed-app splash presentation is derived from the canonical manifest icon together with the manifest background and theme colors (`#f3f6f4` and `#0b5d3b`).

## Replacement process

1. Begin with approved square artwork at 512 × 512 or larger. Preserve the established identity and safe area.
2. Replace `app-icon-master.png`, then export exact 512, 192, 180, 32, and 16 px PNG derivatives using high-quality downsampling. Never upscale a small derivative.
3. Inspect the 16 px and 32 px exports at native size; the mark and word shape must remain recognizable.
4. Keep the canonical filenames stable so Header, Manifest, Apple Touch Icon, favicons, installed application, and offline cache cannot drift.
5. Increment the application version and cache name in `app.js`, `service-worker.js`, `index.html`, `manifest.json`, `package.json`, and `package-lock.json`.
6. Run release sanity, install on desktop/Android and iPhone Safari, and verify the installed icon and launch presentation after clearing the prior installation/cache.

Legacy root-level `*-v2.png`, `*-v3.png`, and `*-v4.png` files remain only as historical source artifacts. Production references must point to `branding/`.
