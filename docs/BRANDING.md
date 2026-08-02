# The Dye Ledger Branding

## Canonical identity

The installed iPhone / Home Screen / PWA artwork is the canonical application identity. The master file is [`branding/app-icon-master.png`](../branding/app-icon-master.png), the exact 1254 × 1254 artwork approved by the Product Owner from `New Icon 050326.png` on July 23, 2026. Do not redraw, reinterpret, crop, recolor, or add a second header mark.

The master depicts the gold ledger/flag mark above the white **THE DYE LEDGER** wordmark with the existing golf illustrations on a dark green field.

## Asset usage

| Surface | Asset | Required size |
| --- | --- | ---: |
| Canonical source | `branding/app-icon-master.png` | 1254 × 1254 |
| Desktop PWA 512 source | `branding/app-icon-512.png` | 512 × 512 |
| Header / iPhone source | `branding/apple-touch-icon.png` | 180 × 180 |
| Desktop PWA 192 source | `branding/app-icon-192.png` | 192 × 192 |
| Browser favicon source | `branding/favicon-32.png` | 32 × 32 |
| Small browser favicon source | `branding/favicon-16.png` | 16 × 16 |

Release builds use immutable filenames such as `branding/apple-touch-icon-v30.3.84.png`. `index.html` uses the same release-specific Apple artwork for the header and its one authoritative Apple Touch Icon link. The header uses the PNG directly with `object-fit: contain`; there is no mask, background-image substitution, or runtime fallback to the 192 px asset.

The 512 px and 192 px desktop PWA files, 180 px Apple file, and favicons are high-quality downsampled derivatives of the approved master. `manifest.json`, `index.html`, and `service-worker.js` reference only the current release-specific copies so browsers, Safari, installed PWAs, and the offline shell see a new resource identity together.

Existing Home Screen icons may remain cached until the user removes and re-adds the app from Safari.

Existing Windows or other desktop PWA icons may remain in the operating system's installation, Start Menu, or taskbar cache even after the web app and service worker update. If the installed icon remains stale, uninstall and reinstall the desktop PWA. The favicon may remain cached separately because browsers maintain a separate site/icon cache; closing old tabs or clearing that cache may be necessary.

The app has no separate hand-authored splash artwork. Installed-app splash presentation is derived from the canonical manifest icon together with the manifest background and theme colors (`#f3f6f4` and `#0b5d3b`).

## Replacement process

1. Begin with approved square artwork at 512 × 512 or larger. Preserve the established identity and safe area.
2. Replace `app-icon-master.png`, then export exact 512, 192, 180, 32, and 16 px PNG derivatives using high-quality downsampling. Never upscale a small derivative.
3. Inspect the 16 px and 32 px exports at native size; the mark and word shape must remain recognizable.
4. Run `npm run branding:version -- vXX.X.XX` to create immutable release copies. Never overwrite a previously released versioned file.
5. Point Header, Manifest, Apple Touch Icon, favicons, and offline cache to that exact release family.
6. Increment the application version and cache name in `app.js`, `service-worker.js`, `index.html`, `manifest.json`, `package.json`, and `package-lock.json`.
7. Run release sanity, install on desktop/Android and iPhone Safari, and verify the installed icon and launch presentation after removing the prior installation.

## Release branding verification

- Installed Home Screen / desktop icon
- Browser favicon
- Launch and splash presentation
- App name, window title, theme color, and background color
- Manifest and service-worker cache version
- Byte identity between canonical sources and release-specific copies

Legacy root-level `*-v2.png`, `*-v3.png`, and `*-v4.png` files remain only as historical source artifacts. Production references must point to `branding/`.
