# Isolated delivery-fault review

v31.0.84 retained direct-path acceptance and current limits are recorded in
[the reconciliation audit](../../../../docs/audits/v31.0.84-assigned-device-reconciliation.md).
The broader matrix remains paused pending owner review of its termination rule.

Test tooling only; does not alter app.js or the published index.html. Current
results/blocker: [controlled staging report](../../../../docs/audits/v31.0.83-controlled-staging-delivery.md).
Do not continue the broad matrix past that failure without reviewing the finding.

Prepare the existing preview with `scripts/start-staging-preview.ps1 -BuildOnly
-DeliveryFaultReview`. Normal existing loopback servers continue to serve the
preview. Open the existing host/remote URL with `?deliveryReview=1` only when
deliberate fault injection is wanted. The panel requires all of: loopback 127.0.0.1,
port 5087/5088, approved staging configuration, staging environment and opt-in query.
Nonempty RPC faults target only DYE-682947. Accepted baseline rounds are excluded.

Modes: observe, lose one successful acknowledgement after actual server commit,
disconnect one request before send, block delivery until cancelled (survives reload),
hold/release one request, or use a fixed invalid bearer on one synthetic request.
The latter exercises actual 401 handling, not natural token expiry. Authentication
headers/response bodies/passwords are never displayed or retained. Never put a
private credential into this tool or its configuration.

The visible JSON records operation IDs, cell facts, payload replay equality,
receipt metadata and safe status codes; sessionStorage retains only this test
evidence. It never reads app localStorage directly. Member/anonymous listeners
use the SDK in the page; only the member uses the app's normal Auth storage key.
The anonymous client has no persisted session. Anonymous denial is not evidence
for an unrelated authenticated outsider or a guest session.

Cancel blocking modes, release held requests and stop review listeners before
leaving. Export visible evidence before replacing a preview. A normal `-BuildOnly`
rebuild removes panel injection and its served asset; reopen normal `index.html`
without the query. The script's fingerprint changes its cache URL when edited.
No cache reset, app-data deletion, forced sign-out or database installation needed.

`Use direct-upload review path` locally returns PGRST202 for this synthetic round's
RPC submissions (including the empty capability probe). The resulting table POSTs
are real staging requests subject to RLS; the RPC itself remains installed. This
is not evidence of an actual schema-cache lag. The mode survives preview reload;
`Use server-reported transport` disables it. Direct request/response events record
safe row facts/status, not operation receipts. Direct retries use current rows and
must not be described as RPC immutable-payload or ledger-idempotency evidence.

`Inspect canonical score attribution` reads minimal synthetic score and participant
facts through the SDK and reports candidate participant roles. Same-account host
and scorer may yield ambiguous/empty resolved attribution. No Auth credential or
private account identifier is displayed. Never infer explicit host attribution
from the gross value alone.
