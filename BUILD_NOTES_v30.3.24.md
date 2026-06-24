# The Dye Ledger v30.3.24 Build Notes

## Release Theme
Start Scoring must work.

## Changes
- Restored the match setup submit path to use direct, user-correctable validation checks instead of allowing diagnostics/validation helpers to block valid match finalization.
- Eliminated user-facing "Missing: variable" style messages by separating internal app errors from setup validation requirements.
- Preserved Match Setup Diagnostics and console diagnostics while ensuring they do not participate in or block valid Start Scoring flows.
- Added safer match finalization error handling that logs unexpected errors to the console and shows a separate internal-error message rather than treating code errors as missing setup fields.
- Updated app version, cache name, service-worker references, visible metadata, and asset query strings to v30.3.24.

## Root Cause
The v30.3.23 finalization diagnostics/validation layer could surface internal JavaScript errors as user-facing missing requirements. The hotfix narrows the Start Scoring path back to direct validation and prevents technical errors from appearing as setup requirements.

## Verification Notes
- Valid local match setup should proceed to Play without a missing-variable message.
- Incomplete setup still shows ordinary user-correctable validation messages such as missing player, tee, course, or selected game requirements.
- No PWA/service-worker behavior was intentionally changed in this release.
