# Claude–Codex handoff

These are workflow rules; they are not technically enforced. The authoritative
approval list is [workflow §16](03_CODEX_WORKFLOW.md#16-actions-requiring-product-owner-approval).

## 1. Roles

- **John — Product Owner:** approves work packages and scope, makes the owner
  decisions in workflow §16 and explicitly accepts remaining risk.
- **Claude — Planner and Independent Reviewer:** drafts packages, reviews Codex's
  implementation plans and implementations, and checks evidence claims. Claude
  edits implementation files only when the approved package assigns that work.
- **Codex — Implementer and Tester:** prepares a plan within approved scope,
  implements, tests and self-reviews under the [Codex workflow](03_CODEX_WORKFLOW.md).
- **ChatGPT — Optional Adviser:** may provide advice; owns no planning, review or
  approval gate.

## 2. Checks within an approved package

Either agent may run these without requesting approval for each invocation:

- `npm test`, `npm run lint`, `npm run validate`, `npm run check:layout`.
- `npm run release:sanity` (optionally `-- vX` for a named release).
- `npm run simulate:compare`, `npm run test:simulations`.
- `node scripts/stress-flamtana.mjs`.
- `git diff --check` and read-only Git inspection.
- A local preview bound only to loopback: `127.0.0.1` or `localhost`.

These permissions apply within the approved package, not as permission to start
unapproved work. A loopback preview is accessible only on this computer. Binding
to `0.0.0.0` or a LAN address, tunnels, port forwarding and publishing can make it
accessible to another device and fall under workflow §16. Staging, production and
AI/Story service calls are excluded unless the package names them. That does not
waive separate approval for database actions or spending.

Record full working-tree status before and after checks. If a check rewrites
tracked files, report the paths and cause. A reviewer does not discard or restore
those files. A package may authorize checks in a disposable Git worktree instead.
Neither agent removes another person's changes to produce a clean check result.

## 3. Review fingerprint — Windows PowerShell 5.1

Every handoff identifies the baseline, branch, HEAD, full working-tree status,
binary diff hash and each untracked file's hash. Compare the current working tree
against the package's starting revision, covering staged changes and any commits
the package specifically authorized. Both agents use the same checkout, with one
writer at a time; review runs against a quiescent tree.

Do not pipe native Git diff output into a hash or write it with `Out-File`:
PowerShell can re-encode it. Git writes the retained diff itself. Set the package
ID, full baseline SHA, review round and the explicit absolute evidence root named
in the work package, then run from the repository root. Sandboxed agents may see a
different `%TEMP%`; use the named folder and confirm the other agent can read it.
For WP-DOC-01 the agreed evidence root is
`C:\Users\johnl\AppData\Local\Temp\dye-ledger`; package evidence goes in its
`WP-DOC-01` subfolder. Do not infer the root from an environment variable.

```powershell
$ErrorActionPreference = 'Stop'
$workPackage = 'WP-DOC-01'
$round = 1
$base = '<full starting SHA>'
$evidenceRoot = '' # Required: copy the absolute evidence root from the work package.
if ([string]::IsNullOrWhiteSpace($evidenceRoot) -or $evidenceRoot -match '[<>]') {
    throw 'Set evidenceRoot to the explicit absolute folder named in the work package.'
}
$rootIsAbsolute = ($evidenceRoot -match '^[A-Za-z]:[\\/]') -or
    ($evidenceRoot -match '^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)')
if (-not $rootIsAbsolute) {
    throw 'Evidence root must be an absolute Windows folder, not a relative or drive-relative path.'
}
$evidenceDir = Join-Path $evidenceRoot $workPackage
New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
$diffPath = Join-Path $evidenceDir ('r{0}.diff' -f $round)
$manifestPath = Join-Path $evidenceDir ('r{0}-manifest.txt' -f $round)
if ((Test-Path -LiteralPath $diffPath) -or
    (Test-Path -LiteralPath $manifestPath)) {
    throw 'Round evidence already exists; use a new round. Do not overwrite it.'
}

$branch = git rev-parse --abbrev-ref HEAD
if ($LASTEXITCODE -ne 0) { throw 'Branch inspection failed' }
$head = git rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'HEAD inspection failed' }
$status = @(git status --porcelain=v1)
if ($LASTEXITCODE -ne 0) { throw 'Working-tree inspection failed' }
git diff --binary $base --output="$diffPath"
if ($LASTEXITCODE -ne 0) { throw 'Retained diff creation failed' }
$diffHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $diffPath).Hash
$untracked = @(git -c core.quotepath=false ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) { throw 'Untracked-file inspection failed' }
$untrackedHashes = @($untracked | Sort-Object | ForEach-Object {
    '{0}  {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash, $_
})
$manifest = @(
    "PACKAGE $workPackage"
    "ROUND $round"
    "BASE $base"
    "BRANCH $branch"
    "HEAD $head"
    'STATUS BEGIN'
) + $status + @(
    'STATUS END'
    "DIFF SHA256 $diffHash"
    "DIFF FILE $diffPath"
    'UNTRACKED BEGIN'
) + $untrackedHashes + @('UNTRACKED END')
$manifest | Set-Content -LiteralPath $manifestPath -Encoding UTF8
$manifest
```

A failed Git, hash or file-write step means no valid fingerprint is reported.
Retain incomplete artifacts as failure evidence and use a new round; do not reuse
them as a successful handoff. An empty diff has SHA256
`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`.

Retain each `r<N>.diff` and `r<N>-manifest.txt` outside the repository. Reviewers
recompute the current diff/hash and untracked hashes into separate temporary
verification files; they do not overwrite handed-off evidence. Match the baseline,
branch, HEAD, full status and content hashes before reviewing. Keep the previous
round's files for comparison; a hash by itself cannot reconstruct an earlier diff
or untracked file. Also retain a per-round copy of each untracked file outside the
repository when its content will be needed for the next review comparison. Never
include credentials in handoff material. Report unrelated working-tree changes;
do not conceal them by restricting the status or untracked list to approved files.

## 4. Handoff loop

1. **Implementation — Codex:** supply the fingerprint, the summary required by
   [workflow §14](03_CODEX_WORKFLOW.md#14-required-implementation-summary-format),
   real check results/logs, before/after check status and each acceptance criterion
   marked met, unmet or NOT_RUN. Include the
   [deviations section](#7-plan-deviations-and-owner-decisions) before the
   verification results, even when there are none.
2. **Independent review — Claude:** recompute and match the fingerprint first;
   stop on mismatch. Review the deviations section next. Number findings `R1`, `R2`,
   etc. Each gives severity, file:line, a failure scenario and the acceptance
   criterion it breaks. List out-of-scope observations separately without fixing them.
3. **Correction — Codex:** fix the listed findings or dispute them with evidence.
   Provide a new fingerprint and a finding-to-change table. Do not expand scope.
4. **Re-review — Claude:** inspect the changes since the previous fingerprint,
   confirm each finding's disposition and check regressions. Return either
   **Ready for owner decision** or a new list of findings.
5. **Escalation:** after two correction rounds, on any disputed finding, or for
   a proposed scope or permission change, return the decision to John.
6. **Owner decision:** John decides the actions governed by workflow §16, subject
   only to its specific-action authorization provisions. A review verdict does
   not create permission or mark an unrun acceptance test passed.

## 5. Evidence and Pending rules

Results are **PASS**, **FAIL** or **NOT_RUN**. Label simulated conditions as such:
injected 401/PGRST202 errors do not prove natural expiry/cache lag, and two browser
tabs are not two physical phones. Every claim cites a log, file or command output.

The documented Pending-resolution action is deliberately re-entering the team's
score through the normal Play controls. Before resolving any Pending pair, record:

- Round code, hole and team.
- Both partners' values on each device.
- Pending counts, time and a screenshot.

Expected Pending occurs only when the test step deliberately creates it. Resolve
it with the documented action and continue. Unexpected Pending is a finding and
fails clean acceptance. Re-entry may continue evidence collection but does not
erase the finding. Only John can accept the remaining risk; record it as
**FAIL — residual risk accepted by John on <date>**, never as PASS.

## 6. Supervised runs

[Collaboration supervisor](../scripts/collab-supervisor/README.md) contains the
WP-AUTO-01 Phase A fake-only implementation and verification procedure. This does
not enable overnight work. Operational commands work only with hash-pinned fake
fixtures and marked disposable OS Temp repositories/evidence. All real agent,
version and auth calls remain disabled pending separate Phase B and Phase C approval.

Use the explicit absolute evidence folder named in the work package. Retain each
round's diff, manifest, untracked-file copies, checks, before/after status and
independent review. A fake test proves only its stated simulated condition.
Report manual cases as PASS, FAIL or NOT_RUN; Phase B-dependent protections stay
UNVERIFIED until their probes run and Claude reviews the evidence.

READY means ready for independent review and John's decision. It grants no
commit, push, merge, deployment, database or spending authority and does not
change [workflow §16](03_CODEX_WORKFLOW.md#16-actions-requiring-product-owner-approval).
Do not bypass a failed isolation/evidence gate or reset a stale lock/budget to
continue. Preserve partial evidence and report the stopped state.

## 7. Plan deviations and owner decisions

### 7.1 What counts as a deviation

List every item below, even if it looks harmless:

- Touching a file outside the plan's file scope, or one the plan says is never touched.
- Changing a design the plan specifies, such as startup order, write order, key
  names, formats or states.
- Changing, merging, splitting or dropping a planned test file or acceptance check.
- Weakening, narrowing or reinterpreting an acceptance criterion, or proving it a
  different way.
- Changing behaviour the plan says must stay the same.
- Changing an existing test, timeout, fixture or harness behaviour that other
  tests rely on.
- Going beyond the approved segment, or doing work planned for a later segment.
- Relying on an owner permission given outside the plan.

### 7.2 Rules

- Every implementation and correction handoff includes the section in §7.3, placed
  before the verification results. If there are no deviations, it says exactly:
  `None. Implementation matches the approved plan.`
- A deviation marked `OWNER DECISION REQUIRED` blocks a **Ready for owner
  decision** verdict until John decides. The rest of the review may continue.
- A deviation marked `Pre-approved` cites an entry in the package decision log
  (§7.4). A mention in the handoff alone is not enough.
- An unlisted deviation that Claude finds is a required correction, even when the
  change itself is acceptable.
- A plan that proves infeasible is a deviation too. Say so in **Why**, so Claude
  can correct the plan.

### 7.3 Handoff template

````markdown
## Deviations from the approved plan

**Plan:** <plan file and SHA-256> · **Approval:** <decision-log entry, e.g. DL-03>

| ID | Plan reference | Plan said | Implemented instead | Category |
|---|---|---|---|---|
| DV-1 | §x.y / AC-xx | <quote or close paraphrase> | <what was done> | design · scope · test · criterion · behaviour · process |

### DV-1: <short title>

- **Why:** <the constraint or defect that forced it; say whether the plan was infeasible>
- **Who is affected:** <all users (G0) · recovery profiles only · tests only · none at runtime>
- **Risk to protected data:** <round history, outbox, holds, auth, or "none", with the reason>
- **Files:** <paths and line ranges>
- **Evidence it is safe:** <named tests or logs, or NOT_RUN>
- **Alternatives considered:** <the plan's approach and why it was rejected; any others>
- **Reversible:** <yes, how / no, why>
- **Authority:** <one of:>
  - `Pre-approved: <decision-log entry>`
  - `OWNER DECISION REQUIRED: <the exact question, with options>`
  - `Within plan latitude: <the plan clause that allows it>`
- **Status:** open · approved · rejected · reverted

### Summary

- **Deviations:** <n> · **Pre-approved:** <n> · **Awaiting owner decision:** <n>
- **Owner decisions needed:**
  1. <DV-n: question>
````

### 7.4 Decision log

Each package keeps one `decision-log.md` in its evidence root. It is an append-only
file. Only John's decisions go in it: plan approvals, segment approvals, deviation
rulings, accepted residual risk, and permissions given outside the plan. Either
agent may append an entry at John's request, quoting his words. Agents never record
their own decisions there.

Never edit or delete an entry. To change a decision, add a new entry that
supersedes it. Record the log's SHA-256 in each round's handoff, so reviewers can
confirm that earlier entries are unchanged.

````markdown
# Decision log: <package ID>

Append-only. Never edit or delete an entry; supersede it with a new one.

## DL-<nn>: <short title>

- **Date (UTC):** <YYYY-MM-DD HH:MM>
- **Decided by:** John
- **Type:** plan approval · segment approval · deviation ruling · scope change · permission · residual risk · other
- **Applies to:** <plan section, segment, DV-n, finding Rn or ODn>
- **Question:** <what was asked, with the options offered>
- **Decision:** <approved · rejected · approved with conditions · deferred>
- **John's words:** "<verbatim quote>"
- **Conditions or limits:** <scope, expiry, evidence still required, or "none">
- **Supersedes:** <DL-nn or "none">
- **Recorded by:** <Codex · Claude> on <date>, from <message or session reference>
````
