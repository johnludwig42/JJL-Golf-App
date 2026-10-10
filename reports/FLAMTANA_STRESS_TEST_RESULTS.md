# Flamtana Special — 50 additional scoring-to-report runs

Result: **50/50 passed**. Deterministic seed: 620050. Reproduce with `node scripts/stress-flamtana.mjs`.

Each run uses the validated team-score write controller with authority enabled; score correction, clear and retry; independent cloud-row hydration; actual finished-candidate/frozen record creation; frozen reload; Ledger Entry generation; browser rendering; and physical PDF page-count verification. An independent calculation checks full signed handicap allocations, net series, tie winners and every component’s cents. No application changes were required.

25 desktop and 25 simulated iOS print runs. All reports have four stroke-total tables, eight saved picks, eight Calcutta ledger rows, no individual statistics, no console errors, no horizontal or vertical overflow, and matching designed/physical PDF page counts.

Timing on this machine (not a physical iPhone benchmark):

| Measurement | Median | 95th percentile | Maximum |
|---|---:|---:|---:|
| Complete engine/scoring/hydration/finalization path | 1199 ms | 1254 ms | 1306 ms |
| Browser report rendering plus PDF generation | 725 ms | 786 ms | 815 ms |

PDF pages: 7–11. Median PDF size: 493 KiB. These measurements found no report-generation bottleneck; they do not establish optimal performance on every device. iOS is simulated in Chrome, and real Shared Match delivery/offline/reconnect remain manual acceptance.

## Generated reports

| Run | Scenario | Tie method | Print surface | PDF pages | Report + PDF time | Result |
|---|---|---|---|---:|---:|---|
| [1](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-01.pdf) | Varied scores/handicaps | split | Desktop | 7 | 782 ms | PASS |
| [2](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-02.pdf) | Entire field tied | hole18 | Simulated iOS | 10 | 702 ms | PASS |
| [3](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-03.pdf) | Two tied winners/unbacked picks | back9 | Desktop | 7 | 720 ms | PASS |
| [4](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-04.pdf) | Three tied winners/skewed picks | last6 | Simulated iOS | 9 | 729 ms | PASS |
| [5](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-05.pdf) | Card-off permutations | split | Desktop | 7 | 726 ms | PASS |
| [6](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-06.pdf) | Alternating foursome minima | hole18 | Simulated iOS | 9 | 715 ms | PASS |
| [7](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-07.pdf) | Large/signed handicaps | back9 | Desktop | 8 | 742 ms | PASS |
| [8](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-08.pdf) | Zero stakes | last6 | Simulated iOS | 8 | 676 ms | PASS |
| [9](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-09.pdf) | Penny stakes/unequal backing | split | Desktop | 7 | 765 ms | PASS |
| [10](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-10.pdf) | Long names/mixed stakes | hole18 | Simulated iOS | 10 | 801 ms | PASS |
| [11](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-11.pdf) | Varied scores/handicaps | back9 | Desktop | 7 | 745 ms | PASS |
| [12](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-12.pdf) | Entire field tied | last6 | Simulated iOS | 8 | 675 ms | PASS |
| [13](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-13.pdf) | Two tied winners/unbacked picks | split | Desktop | 7 | 717 ms | PASS |
| [14](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-14.pdf) | Three tied winners/skewed picks | hole18 | Simulated iOS | 11 | 724 ms | PASS |
| [15](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-15.pdf) | Card-off permutations | back9 | Desktop | 7 | 723 ms | PASS |
| [16](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-16.pdf) | Alternating foursome minima | last6 | Simulated iOS | 9 | 724 ms | PASS |
| [17](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-17.pdf) | Large/signed handicaps | split | Desktop | 7 | 727 ms | PASS |
| [18](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-18.pdf) | Zero stakes | hole18 | Simulated iOS | 10 | 644 ms | PASS |
| [19](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-19.pdf) | Penny stakes/unequal backing | back9 | Desktop | 7 | 727 ms | PASS |
| [20](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-20.pdf) | Long names/mixed stakes | last6 | Simulated iOS | 10 | 782 ms | PASS |
| [21](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-21.pdf) | Varied scores/handicaps | split | Desktop | 8 | 727 ms | PASS |
| [22](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-22.pdf) | Entire field tied | hole18 | Simulated iOS | 10 | 658 ms | PASS |
| [23](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-23.pdf) | Two tied winners/unbacked picks | back9 | Desktop | 7 | 733 ms | PASS |
| [24](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-24.pdf) | Three tied winners/skewed picks | last6 | Simulated iOS | 9 | 686 ms | PASS |
| [25](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-25.pdf) | Card-off permutations | split | Desktop | 7 | 731 ms | PASS |
| [26](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-26.pdf) | Alternating foursome minima | hole18 | Simulated iOS | 9 | 696 ms | PASS |
| [27](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-27.pdf) | Large/signed handicaps | back9 | Desktop | 7 | 744 ms | PASS |
| [28](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-28.pdf) | Zero stakes | last6 | Simulated iOS | 8 | 674 ms | PASS |
| [29](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-29.pdf) | Penny stakes/unequal backing | split | Desktop | 8 | 757 ms | PASS |
| [30](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-30.pdf) | Long names/mixed stakes | hole18 | Simulated iOS | 10 | 815 ms | PASS |
| [31](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-31.pdf) | Varied scores/handicaps | back9 | Desktop | 8 | 763 ms | PASS |
| [32](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-32.pdf) | Entire field tied | last6 | Simulated iOS | 8 | 671 ms | PASS |
| [33](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-33.pdf) | Two tied winners/unbacked picks | split | Desktop | 7 | 720 ms | PASS |
| [34](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-34.pdf) | Three tied winners/skewed picks | hole18 | Simulated iOS | 11 | 703 ms | PASS |
| [35](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-35.pdf) | Card-off permutations | back9 | Desktop | 7 | 731 ms | PASS |
| [36](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-36.pdf) | Alternating foursome minima | last6 | Simulated iOS | 9 | 703 ms | PASS |
| [37](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-37.pdf) | Large/signed handicaps | split | Desktop | 8 | 748 ms | PASS |
| [38](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-38.pdf) | Zero stakes | hole18 | Simulated iOS | 10 | 681 ms | PASS |
| [39](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-39.pdf) | Penny stakes/unequal backing | back9 | Desktop | 7 | 759 ms | PASS |
| [40](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-40.pdf) | Long names/mixed stakes | last6 | Simulated iOS | 10 | 786 ms | PASS |
| [41](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-41.pdf) | Varied scores/handicaps | split | Desktop | 7 | 709 ms | PASS |
| [42](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-42.pdf) | Entire field tied | hole18 | Simulated iOS | 10 | 689 ms | PASS |
| [43](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-43.pdf) | Two tied winners/unbacked picks | back9 | Desktop | 7 | 703 ms | PASS |
| [44](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-44.pdf) | Three tied winners/skewed picks | last6 | Simulated iOS | 9 | 712 ms | PASS |
| [45](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-45.pdf) | Card-off permutations | split | Desktop | 7 | 728 ms | PASS |
| [46](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-46.pdf) | Alternating foursome minima | hole18 | Simulated iOS | 9 | 711 ms | PASS |
| [47](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-47.pdf) | Large/signed handicaps | back9 | Desktop | 7 | 755 ms | PASS |
| [48](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-48.pdf) | Zero stakes | last6 | Simulated iOS | 8 | 681 ms | PASS |
| [49](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-49.pdf) | Penny stakes/unequal backing | split | Desktop | 7 | 729 ms | PASS |
| [50](C:/Projects/JJL-Golf-App/tmp/report-qa/v62/stress/round-50.pdf) | Long names/mixed stakes | hole18 | Simulated iOS | 10 | 772 ms | PASS |
