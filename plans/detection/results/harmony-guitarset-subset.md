# Free play on GuitarSet (52 excerpts, every seventh file; M7, 2026-11-19)

`npm run detect:bench -- harmony --guitarset ~/projects/.datasets/guitarset --limit 51`

After the chord path's decision one beat late (`CHORD_LAG_BEATS`), the
seventh in the chord score, the "three voices at once" test for a chord and
one quiet beat held (branch `mvp-detect-m7-chord`):

| playing | chain | chord root right, all beats | beats given a chord | root right when given | key score at 15 s | key score at 30 s | key settled | settled key right | seconds to settle | "inside" right | "outside" right | "outside" right, with the chart |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo | gs_annotation | 1% (1511) | 5% (1511) | 20% (80) | 0.53 | 0.67 | 88% (26) | 83% (23) | 16.5 | 99% (1097) | 92% (89) | - |
| solo | gs_mic | 4% (1489) | 13% (1489) | 30% (200) | 0.64 | 0.64 | 85% (26) | 82% (22) | 13.5 | 83% (1497) | 51% (140) | 48% (192) |
| strummed | gs_annotation | 80% (1479) | 91% (1479) | 88% (1350) | 0.82 | 0.88 | 96% (26) | 84% (25) | 12.5 | 99% (3859) | 90% (119) | - |
| strummed | gs_mic | 79% (1457) | 92% (1457) | 86% (1335) | 0.82 | 0.83 | 96% (26) | 92% (25) | 14.4 | 76% (3739) | 49% (123) | - |

Strummed, microphone: 1,145 of 1,457 beats right (78.6%); 91.6% of beats
given a chord, 85.8% of those right. By style: rock 93%, singer-songwriter
87%, jazz 77%, bossa nova 75%, funk 60%.

Before (`3f596af6`: the chord of each beat decided as it closed):

| playing | chain | chord root right, all beats | beats given a chord | root right when given | key score at 15 s | key score at 30 s | key settled | settled key right | seconds to settle | "inside" right | "outside" right | "outside" right, with the chart |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo | gs_annotation | 2% (1511) | 8% (1511) | 28% (128) | 0.53 | 0.67 | 88% (26) | 83% (23) | 16.5 | 99% (1061) | 92% (86) | - |
| solo | gs_mic | 4% (1489) | 15% (1489) | 28% (230) | 0.64 | 0.64 | 85% (26) | 82% (22) | 13.5 | 83% (1468) | 50% (147) | 48% (192) |
| strummed | gs_annotation | 71% (1479) | 84% (1479) | 85% (1236) | 0.82 | 0.88 | 96% (26) | 84% (25) | 12.5 | 99% (3746) | 85% (155) | - |
| strummed | gs_mic | 70% (1457) | 84% (1457) | 84% (1218) | 0.82 | 0.83 | 96% (26) | 92% (25) | 14.4 | 76% (3632) | 51% (146) | - |
