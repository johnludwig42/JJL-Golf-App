The Dye Ledger v27.2

Changes in this build:

1. Team Games Payout desktop alignment
- Reworked the desktop team payout header structure so Player, Games, and Total align cleanly.
- Added grouped desktop headers and kept the fixed player pane and scrolling games pane synchronized.
- Preserved the mobile payout layout.

2. Smart scoring input commit flow
- Score entry now advances only after a committed entry, not on each keystroke.
- Pressing Enter/Done or leaving a changed score field commits the value.
- After a committed score, focus moves to the next editable player on the same hole.
- After the last editable player on a hole is committed, the app advances to the next hole.
- Multi-digit scores such as 10 are supported because advancement happens on commit, not after the first digit.
- Re-entering a score without changing it does not trigger an unexpected jump.

Notes:
- Local-only and shared-match foundations were preserved.
- Existing scoring calculations and payout logic were not intentionally changed.
