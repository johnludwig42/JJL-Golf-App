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
ID, full baseline SHA and review round, then run from the repository root:

```powershell
$ErrorActionPreference = 'Stop'
$workPackage = 'WP-DOC-01'
$round = 1
$base = '<full starting SHA>'
$evidenceDir = Join-Path $env:TEMP ('dye-ledger\' + $workPackage)
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
   marked met, unmet or NOT_RUN.
2. **Independent review — Claude:** recompute and match the fingerprint first;
   stop on mismatch. Number findings `R1`, `R2`, etc. Each gives severity, file:line,
   a failure scenario and the acceptance criterion it breaks. List out-of-scope
   observations separately without fixing them.
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
