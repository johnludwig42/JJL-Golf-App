# Collaboration supervisor — Phase A

This is the fake-only implementation for WP-AUTO-01. It does **not** start an
overnight session. No real agent adapter, installed CLI discovery, auth probe,
real approval, deployment or scheduler is enabled. The complete CLI works only
with marked disposable repositories and evidence below OS Temp; it rejects the
project checkout, everything under `C:\Projects` and any repository with a remote.
Changing a flag or supplying a platform record cannot enable real execution.
John must separately approve Phase B and Phase C, with a new plan review and
reviewed implementation before real agents can run.

Use the accepted work package and its independent review as the authority. This
README describes the current implementation, not permission to operate it.

## Files and entry points

- `supervisor.js`: fake-only `approve`, `run`, `resume`, `recover`, `status`.
  Requires `DYE_SUPERVISOR_TEST=1`, fake kind/mode, TestHarness, pinned fixture
  bytes and a matching disposable repository marker. `platform-probes` refuses.
- `lib/fake-config.js`, `fake-runtime.js`, `coordinator.js`: composition root,
  actual disposable worktrees/checks, step broker, locks, sweep and crash recovery.
- `lib/state.js`: coordinator, maximum two correction rounds;
  checks, scope, approval and integrity gates before READY.
- `lib/policy.js`, `lib/agents.js`, `schemas/`: fixed fake dispatch and structured
  results. The only Node fixture dispatch target is hashed `fake-agent.js`.
- `lib/git.js`, `checks.js`, `snapshot.js`, `fingerprint.js`: explicit Git paths,
  hardened config, closure checks, scope, regular-file snapshots and retained
  per-round binary diffs, manifests and untracked files.
- `lib/approvals.js`, `lock.js`, `budget.js`, `evidence.js`, `report.js`: approval
  binding, lock/recovery logic, bounded budget, indexed evidence and reports.
- `launch.ps1`, `run-step.ps1`, `lib/windows-job.ps1`: Windows fake-process test
  wrappers. J0 and J1 use kill-on-close; children start suspended, enter the job,
  then resume. STARTUPINFOEX limits inherited handles to stdout/stderr pipes.
  These wrappers require the test gate and explicit TestHarness switch. This is
  a working fake process-launch path, not protection against a malicious same-user
  operator. Real platform isolation and CLI versions still require Phase B.
- `lib/processes.js`, `process-probe.ps1`, `lib/sweep.ps1`: real PID/creation-time
  inspection and marker enumeration. Only reverified escapes may be terminated.
  The sweep identifies only `node.exe` processes whose command line contains
  both the run marker and the fake fixture path. It does not identify arbitrary
  real-agent executables or shells.
- `acceptance/`: CLI integration, Windows shutdown and operator-only tests;
  the Phase B gate still refuses.

No new dependency or package script is needed. The regular test suite includes
`tests/collab-supervisor.test.js`; manual shutdown tests stay outside `npm test`.

## Offline verification

From the project checkout:

```powershell
node --test tests/collab-supervisor.test.js
node --test scripts/collab-supervisor/acceptance/fake-cli.test.js
node --test scripts/collab-supervisor/acceptance/windows-shutdown.test.js
node --test scripts/collab-supervisor/acceptance/platform-probes.test.js
```

The first command runs fake agent subprocesses and real Git inside disposable OS
temporary repositories only. It commits there to verify fsmonitor suppression,
ref-drift detection and redirected `.git` pointers. It never commits to this
checkout. The manual PowerShell fingerprint comparison uses the documented
procedure and checks both manifest and diff bytes. It explicitly imports the
Windows PowerShell Utility module because the inherited module search path may
refer to a different PowerShell installation.

CLI integration is separate from the ordinary under-30-second fixture suite: it
uses real Windows wrappers and real metadata enumeration, and reports its actual
longer duration. Cases cover ready, correction, escalation, timeout, auth/usage,
crash/recover/resume and stale/damaged locks. Each checks evidence, survivors and
the unchanged source checkout. Disposable roots are reported and retained for
review; successfully completed worktrees are removed after their evidence is saved.

Synthetic CLI configuration and bootstrap are demonstrated by
`tests/fixtures/collab-supervisor/cli-repository.js`. Use `node supervisor.js
<command> --spec <absolute-config.json>` with `--fixture-consent` only for synthetic
test consent. It cannot approve a real work package; its record says it is not
owner approval. Normal recovery requires interactive consent. After a crash,
review its retained diff, run recover, then resume with `--retry-agent`; budget
and deadline stay fixed. Other terminal stops require a fresh synthetic test run.
Read-only status also accepts the retained `state.json` directly.
Watch a run with `supervisor.js status --spec <absolute-config.json>`, rather
than opening or continuously reading `state.json`. Windows readers without
delete sharing can block its atomic replacement. Replacement retries EPERM,
EBUSY and EACCES for at most about one second, then stops with EVIDENCE_WRITE;
the old checkpoint is never deleted to force a replacement.

Tests retain temporary files for investigation. Logs and per-round handoff copies
must go to the explicit absolute folder in the work package. Do not infer that
folder from TEMP: restricted processes can see a private temporary directory.
Do not change folder permissions when a write fails.

The Windows controller kills only PIDs it created and whose creation time it
verified. Unknown identity means refusal, never a wider process-tree kill. Its
layer-disable switches are supplied only by this test harness, not by the public
CLI. A refused or distorted Job Object test is NOT_RUN. A real implementation
failure is FAIL; the logs retain intermediate failures and their corrections.
WMI escape is deliberately not attempted inside the agent environment. Ctrl+C
and console-close need a console created by the test, never the user's console.
Those cases remain NOT_RUN until an approved operator can run them safely.

### Shutdown layers and the round 1 correction

Node/libuv places its non-detached children in an additional kill-on-close job.
Round 1's Node driver spawned the wrapper itself; that extra job masked the
launcher-on-Node-exit and wrapper-parent-death mechanisms. The earlier attribution
to the sandbox was wrong. Those two round 1 passes did not isolate the acting
layer, and parent-death was unproved even outside the sandbox.

`lib/broker.ps1` now starts the wrapper as a native sibling of the coordinator,
assigning it to J0 before resume. The wrapper starts the fake agent in J1. The
coordinator's libuv job therefore cannot kill the wrapper. The design does not
rely on libuv's job or breakaway settings; J0/J1 forbid breakaway. Every native
step records its timestamp and acting layer. Isolation tests disable the other
watch, assert the action record, and verify no owned survivors. Membership records
check the same live agent PID in J0 and J1; breakaway attempts must be refused.
The launcher also holds a backup wrapper job (Jw). When the wrapper exits, it
observes Jw becoming empty before closing that handle or attempting a fallback
kill. A required fallback is ISOLATION, not success; this prevents Jw from masking
J1's kill-on-close proof. The wrapper-close test asserts the recorded observation.

For console close, logoff and shutdown, the native console handler signals the
main loop and waits up to four seconds before returning. The loop terminates J0,
waits for it to empty and writes the launcher stop record before releasing that
handler. A WMI sweep cannot be guaranteed within this window, so closing-console
cleanup records NOT_RUN (`console_close_time_limit`), retains the global lock for
`recover`, and finalizes as ISOLATION. It never counts as a complete sweep.
Ctrl+C signals the loop without the terminating-event wait.

The wrapper's fixture hash comparison is a consistency check: its hash and path
come from the same request. The actual fake-agent pin is in `loadFakeConfig`;
check execution is pinned by the baseline closure comparison. The wrapper check
does not authenticate a same-user writer or bind a spool request to the launch
spec. Such a request still runs inside J0; same-user forgery is not prevented.

### Operator-only cases — implemented, not run by Codex

WMI escape, Ctrl+C and console-close have executable test bodies. They are skipped
by default; both the Node entry and PowerShell action helper require operator
opt-in and refuse a `CodexSandboxUsers` token or unreadable token groups. WMI
creates exactly one hash-pinned marked fake process; the real sweep must detect
and remove it. Console tests create their own console, verify PID/creation time
and its reported window handle, then signal only that console. They never signal
the operator's existing console. Their result remains NOT_RUN until an authorized
operator runs them outside the agent environment and the logs are reviewed.

For console close only, the test explicitly starts a classic `conhost.exe` rather
than relying on the default terminal host. Before closing its window, it verifies
the conhost PID/creation time, launcher PID/creation time, launcher membership in
the test-owned job, and that the window belongs to that exact conhost PID. It
requires launcher exit within eight seconds. The close/logoff/shutdown handler
exclusively creates `<launchSpec>.console-event.json` with event kind and UTC
timestamp on entry; a missing record is reported as `close not delivered`.
Ctrl+C and WMI retain their previously tested paths. This description is not an
operator acceptance result; actual console delivery remains for John's rerun.

The owner runs this from their own terminal after approval; Codex does not run it:

```powershell
$env:DYE_A5_OPERATOR = '1'
$env:DYE_SUPERVISOR_TEST = '1'
node --test --test-name-pattern='detected_wmi_escape|console_close|owner_interrupt' scripts/collab-supervisor/acceptance/windows-shutdown.test.js
```

Clear the opt-in afterwards with `$env:DYE_A5_OPERATOR = '0'`. These tests create
only marked disposable data; no real CLI, user console or credential is a target.

## State, budget and evidence

The fake coordinator follows PRECHECK → PREPARE_WORKTREE → IMPLEMENT → CAPTURE →
CHECK → REVIEW, then READY or at most two CORRECT/review rounds. Missing mandatory
criteria, failed/NOT_RUN checks or unresolved findings prevent READY. Agent output
cannot authorize a command. Defined stops and refusals have distinct library exit
codes, also returned by the CLI.

Approval source and retained package bytes are checked before each step and on
resume. Records are hash chained and label John as recorded, not identity verified.
TTY/marker/ancestry checks are heuristics tested with injected inputs. They do not
authenticate the person at the keyboard or protect files from same-user edits.

Budget is the lesser of unspent time and time before the original deadline. A
ten-second heartbeat records in-flight consumption. Resume never resets that
deadline; interrupted work is conservatively charged, and interrupted implement
or correction steps require an owner choice. Sleep/hibernate is unverified.

One lock belongs to the configured evidence root. A flushed complete temporary
file is atomically linked into place, then that call's transient name is removed.
Per package §9, a lock is held only when both PID and creation time match a live
owner. A reused PID means the recorded owner is dead; its current occupant is
never terminated by recovery. Both owners must be dead for LOCK_STALE. Creation
times are compared as exact canonical decimal FILETIME strings, never rounded
numbers; missing or incompatible formats give LOCK_INSPECTION_FAILED.
An inspection returns `{alive:true,createdAt}`, `{alive:false}` only for confirmed
absence, or `{unknown:true,reason}`/null for failure. Failure is separately reported
as LOCK_INSPECTION_FAILED. Empty/unreadable locks give LOCK_DAMAGED. They cannot
be stolen; recover requires interactive confirmation (including damaged consent),
owner inspection and a successful real sweep, then archives the old lock. If
enumeration is denied, the sweep is NOT_RUN and the lock stays recoverable.
Normal release is performed by the parent only after the coordinator and launcher
are both confirmed dead and the final job/sweep records are clean. A coordinator
completion alone cannot release the mutex. Crashes retain it for interactive recovery.

Immutable evidence uses exclusive writes. Mutable checkpoints use same-volume
exclusive temporary files, flush and rename without deleting the prior target.
Append records are flushed and hash chained. A checkpoint may have reached disk
before its index append fails: this is EVIDENCE_WRITE, not a valid checkpoint.
Retain incomplete artifacts and report the mismatch. Atomic replacement failure
on a restricted Windows filesystem is a failure, with no destructive workaround.
Directory-metadata durability/power-loss survival is not guaranteed.

Storage failure stops further work, then state/report/console are attempted
independently. Neither a final disk report nor console output is guaranteed on
disk exhaustion, a hard kill or process shutdown. `status` labels its output
reconstructed; it does not certify the source checkpoint or manufacture a missing
original report. Verify the evidence index, approval, identity, scope and tree
signature before any future resume. Never steal a stale lock or reset a budget.

## Commands and checks

Supervisor dispatch does not use npm or a shell. The fake agent command is pinned
Node plus the approved fixture and a finite scenario. The check table contains
only validate, release:sanity and hardened Git diff-check. The first two require
baseline-identical script and package bytes immediately before execution. A
modified closure returns NOT_RUN. A missing approved executor also returns
NOT_RUN. The composition root supplies the real fixed executor, operating only
on baseline-pinned fixture check scripts in the throwaway repository. No agent
process may remain during a check. Repository release gates are run separately under
the approved package, with full before/after status retained.

Git metadata paths are explicit, with pointer/executable hashes checked on each
call. System/global config, fsmonitor, hooks, external diff and pagers are
disabled. Diff capture disables text conversion. System Git can legitimately be
hard linked; its resolved binary bytes are pinned outside the working tree.
Agent-controlled files and review snapshots reject symlinks and hard links.

Child environments are constructed from an allowlist. Provider variables,
NODE_OPTIONS/NODE_PATH and npm settings do not pass through. That does not prevent
credential-file reads. No network/read/ACL isolation guarantee is established here.

Auth accepts only the configured fields and versions; none is guessed. Missing
expectations fail closed. The fake parser classifies stderr/non-JSON diagnostics
and structured error codes, never ordinary words inside a valid result JSON.
Real adapters require structured usage/auth detection captured in Phase B.

## Guarantee register and evidence

The round handoff records actual PASS/FAIL/NOT_RUN per test and log. A test PASS
is not independent acceptance: Claude must review it. Every Phase B-dependent
row stays UNVERIFIED, including rows whose fake subtests pass.

| Register | Phase A evidence / remaining gate |
| --- | --- |
| G1 | A5 fake trees; partial until every required manual case passes; sweep sees only `node.exe` with run marker and fixture on its command line; real CLI B8 UNVERIFIED |
| G2 | Sweep covers only `node.exe` with run marker and fixture on its command line; other escaped executables/shells not identified; elevated/broker descendants B1 UNVERIFIED |
| G3–G8 | Write/read/network/tool/MCP/Claude confinement B2–B6 UNVERIFIED |
| G9 | A3 dispatch/argv refusal tests; fake-only |
| G10 | A3 closure drift and actual fixed fake-check executor |
| G11 | A2 real disposable Git pointer/ref/fsmonitor and link tests |
| G12 | A4 environment removal tests; does not prove read isolation |
| G13 | A12 fixture auth parser; real outputs B7 UNVERIFIED |
| G14 | D1 owner confirmation only; UNVERIFIED |
| G15 | A7 approval drift tests; file protection B2 UNVERIFIED |
| G15b | Identity not provided; recorded approval only |
| G16 | A11 atomic/damaged lock tests plus real CLI inspection/recovery |
| G17 | A9 resume/accounting/heartbeat tests; G20 still UNVERIFIED |
| G18 | A10 injected storage/index/rename failures; no power-loss guarantee |
| G19 | A1/A2 coordinator, scope, fingerprint and snapshot gates |
| G20 | Sleep/hibernate UNVERIFIED; unattended operation blocked |
| G21 | A13 real dispatch refused even with forged platform record |

Criteria 1–3, 5–12 map to A1–A4/A6–A13; criterion 4 is manual A5.
Criterion 13 is Phase B, 14 is Phase C, and 15 requires Claude's independent
implementation verdict. The handoff records any unmet or partially tested item.

## Phase B setup — NOT APPLIED

This section grants no permission and contains no runnable setup command.
The following require a separately approved work package and reviewed plan:

1. Decide the still-open owner decisions, including exact runtime versions,
   authentication outputs, budgets and extra-usage confirmation.
2. Establish the separately approved trusted bundle, control folder, sentinel
   locations and permission policy; review every concrete permission change.
3. Implement and verify real runtime adapters and platform probes. Do not turn
   the Phase A refusal into a configuration bypass.
4. Run B1–B8 and review all required rows for the exact bundle/versions. B9 is a
   separately reviewed optional check sandbox. Failed/NOT_RUN gates block Phase C.
5. Obtain separate Phase C approval for the bounded attended pilot. READY never
   authorizes commit, push, merge, deployment, database changes or spending.

Open Phase B design items (not implemented or verified here):

- Sweep identification for real agents, including shells and descendants without
  the fake Node marker/fixture command line.
- Bind step requests to the launch spec using pinned hashes or an authenticated
  spool, alongside the separately approved file protections.

Do not create `_supervisor`, install sentinels, change ACLs, call real CLIs or
start a pilot using this Phase A package.
