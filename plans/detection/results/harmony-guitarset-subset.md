# Free play on GuitarSet (52 excerpts, every seventh file; M7, 2026-11-19)

`npm run detect:bench -- harmony --guitarset ~/projects/.datasets/guitarset --limit 51`

| playing | chain | chord root right, all beats | beats given a chord | root right when given | key score at 15 s | key score at 30 s | key settled | settled key right | seconds to settle | "inside" right | "outside" right | "outside" right, with the chart |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo | gs_annotation | 2% (1511) | 8% (1511) | 28% (128) | 0.53 | 0.67 | 88% (26) | 83% (23) | 16.5 | 99% (1061) | 92% (86) | - |
| solo | gs_mic | 4% (1489) | 15% (1489) | 28% (230) | 0.64 | 0.64 | 85% (26) | 82% (22) | 13.5 | 83% (1468) | 50% (147) | 48% (192) |
| strummed | gs_annotation | 71% (1479) | 84% (1479) | 85% (1236) | 0.82 | 0.88 | 96% (26) | 84% (25) | 12.5 | 99% (3746) | 85% (155) | - |
| strummed | gs_mic | 70% (1457) | 84% (1457) | 84% (1218) | 0.82 | 0.83 | 96% (26) | 92% (25) | 14.4 | 76% (3632) | 51% (146) | - |
