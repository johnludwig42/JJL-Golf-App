# Isolated local staging app — October 25, 2026

Session-handoff correction: the original helper used the SDK's default Auth
storage key while the main app uses its exported ACCOUNT_AUTH_STORAGE_KEY. A
successful helper login therefore did not sign the main app in. The preview helper
now loads identity-security.js and derives that shared storage key explicitly;
production runtime code is unchanged. Re-enter staging credentials once in the
updated helper, then verify More / Account & Security. An isolated browser test
with mocked ordinary user/profile/session responses confirms main-app handoff and
reload persistence, with zero production requests. The test bypasses the service
worker so profile requests stay inside its mock. Real user verification is pending.

The preview serves a copied current app at `http://127.0.0.1:5087` with a staging
banner and overridden staging configuration. Production files are not edited.
Browser localStorage, Auth sessions and service-worker caches are isolated by the
local origin from the GitHub Pages production app. It binds loopback only; a phone
cannot reach this URL. Physical two-phone verification needs a separately reviewed
HTTPS staging host later; this preview does not satisfy that gate.

## Sign in

Open <http://127.0.0.1:5087/staging-sign-in.html> on this computer. Enter the email
and password of the confirmed staging account created in Supabase. The preview-only
page calls staging Auth password sign-in, then opens index.html using the same
Supabase session storage. It sends no OTP email and requires no template/redirect
configuration changes. The production app's normal sign-in code is unchanged.

The form clears the password after an attempt and does not save/log it; the browser
may offer its usual password-manager behavior. Only ordinary session tokens persist
through the existing Supabase client. Do not paste passwords or tokens in chat.
If sign-in succeeds, verify the STAGING TEST banner and More / Account & Security
show the test account. Do not import production saved rounds into the preview.

## Start or restart locally

```powershell
& 'C:\Projects\JJL-Golf-App\scripts\start-staging-preview.ps1'
```

Leave that PowerShell window running; Ctrl+C stops it. It builds approved tracked
static assets into ignored `tmp/report-qa/shared-staging/preview`, not the repository
root. The ignored preview-settings.json contains only the confirmed staging URL,
reference and public publishable key. No database password/private key is required.
The script refuses production/mismatched references, non-publishable keys and
unexpected files in the preview directory. It serves no repository metadata,
source SQL, audit exports, environment files or private Auth configuration.

The builder derives branding version from package.json; it does not bump release
identity or copy obsolete app releases. This is temporary developer test tooling,
not a published app or a production password-login capability.

## Verification

- Production target refusal checked before preview generation.
- Generated browser config points only to darbakmabpbkikisadop with staging Auth.
- All 41 current service-worker assets return 200 from the local preview.
- Five private/non-app paths return 404; production config remains unchanged.
- Temporary browser check: sign-in enabled; mocked Auth failure shown; password
  cleared; staging app renders with banner; zero production Supabase requests.
- All browser Auth writes were intercepted in the check. No real login, account,
  email or score write was performed by the assistant.
- Initial browser mock lacked OPTIONS/CORS handling; corrected mock passed. This
  was test-harness configuration, not a real staging Auth failure.

No full client release suite rerun for this isolated copy/launcher; runtime app
sources are unchanged. Real successful sign-in, authorized score delivery, guest
scoring, RPC, Realtime, rollback and two-phone tests remain unverified. Guest
sign-in was observed disabled and requires a staging-only configuration review
before exercising the guest path.
