# The Dye Ledger Branding

## Canonical identity

The installed iPhone / Home Screen / PWA artwork is the canonical application identity. The master file is [`branding/app-icon-master.png`](../branding/app-icon-master.png), a 512 × 512 PNG carried forward from the approved v4 installed-app artwork. Do not redraw, reinterpret, crop, recolor, or add a second header mark.

The master depicts the gold ledger/flag mark above the white **THE DYE LEDGER** wordmark with the existing golf illustrations on a dark green field.

## Asset usage

| Surface | Asset | Required size |
| --- | --- | ---: |
| Canonical source | `branding/app-icon-master.png` | 512 × 512 |
| Desktop PWA 512 icon | `branding/app-icon-512.png` | 512 × 512 |
| Header / iPhone Home Screen | `branding/apple-touch-icon.png` | 180 × 180 |
| Desktop PWA 192 icon | `branding/app-icon-192.png` | 192 × 192 |
| Browser favicon | `branding/favicon-32.png` | 32 × 32 |
| Small browser favicon | `branding/favicon-16.png` | 16 × 16 |

`index.html` uses `branding/apple-touch-icon.png` for both the top-left header artwork and its one authoritative Apple Touch Icon link. The header uses the PNG directly with `object-fit: contain`; there is no mask, background-image substitution, or runtime fallback to the 192 px asset.

`branding/app-icon-512.png` is byte-for-byte identical to `branding/app-icon-master.png`. The 192 px desktop PWA file and 180 px Apple file are approved same-artwork derivatives at their required platform dimensions. `manifest.json` uses versioned v30.3.74 URLs for the 192 px and 512 px desktop icons so Chromium can detect the current icon resources without pointing a 512 px slot at the 180 px Apple file. `service-worker.js` precaches those exact versioned URLs and the Apple file.

Existing Home Screen icons may remain cached until the user removes and re-adds the app from Safari.

Existing Windows or other desktop PWA icons may remain in the operating system's installation, Start Menu, or taskbar cache even after the web app and service worker update. If the installed icon remains stale, uninstall and reinstall the desktop PWA. The favicon may remain cached separately because browsers maintain a separate site/icon cache; closing old tabs or clearing that cache may be necessary.

The app has no separate hand-authored splash artwork. Installed-app splash presentation is derived from the canonical manifest icon together with the manifest background and theme colors (`#f3f6f4` and `#0b5d3b`).

## Replacement process

1. Begin with approved square artwork at 512 × 512 or larger. Preserve the established identity and safe area.
2. Replace `app-icon-master.png`, then export exact 512, 192, 180, 32, and 16 px PNG derivatives using high-quality downsampling. Never upscale a small derivative.
3. Inspect the 16 px and 32 px exports at native size; the mark and word shape must remain recognizable.
4. Keep the canonical filenames stable so Header, Manifest, Apple Touch Icon, favicons, installed application, and offline cache cannot drift.
5. Increment the application version and cache name in `app.js`, `service-worker.js`, `index.html`, `manifest.json`, `package.json`, and `package-lock.json`.
6. Run release sanity, install on desktop/Android and iPhone Safari, and verify the installed icon and launch presentation after clearing the prior installation/cache.

Legacy root-level `*-v2.png`, `*-v3.png`, and `*-v4.png` files remain only as historical source artifacts. Production references must point to `branding/`.
