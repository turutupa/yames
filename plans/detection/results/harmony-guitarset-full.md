# Free play on GuitarSet (all 360 excerpts; M7, 2026-11-19)

`npm run detect:bench -- harmony --guitarset ~/projects/.datasets/guitarset`

Run once with the code tuned on the 52-excerpt subset
(`harmony-guitarset-subset.md`); nothing was tuned on this set.

| playing | chain | chord root right, all beats | beats given a chord | root right when given | key score at 15 s | key score at 30 s | key settled | settled key right | seconds to settle | "inside" right | "outside" right | "outside" right, with the chart |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo | gs_annotation | 2% (10386) | 4% (10386) | 37% (452) | 0.65 | 0.66 | 89% (180) | 73% (161) | 15.6 | 98% (7777) | 81% (607) | - |
| solo | gs_mic | 5% (10236) | 15% (10236) | 32% (1548) | 0.65 | 0.64 | 93% (180) | 67% (167) | 14.8 | 79% (9764) | 46% (857) | 59% (1304) |
| strummed | gs_annotation | 79% (10386) | 91% (10386) | 87% (9471) | 0.76 | 0.78 | 96% (180) | 82% (173) | 13.4 | 99% (24892) | 93% (803) | - |
| strummed | gs_mic | 78% (10236) | 92% (10236) | 84% (9410) | 0.75 | 0.79 | 92% (180) | 85% (166) | 13.5 | 75% (25395) | 48% (721) | - |

Strummed, microphone: 7,945 of 10,236 beats right (77.6%); 91.9% of beats
given a chord, 84.4% of those right. By style: singer-songwriter 94%, rock
92%, bossa nova 77%, jazz 63%, funk 61%.

Before (`3f596af6`: the chord of each beat decided as it closed), the same
360 excerpts:

| playing | chain | chord root right, all beats | beats given a chord | root right when given | key score at 15 s | key score at 30 s | key settled | settled key right | seconds to settle | "inside" right | "outside" right | "outside" right, with the chart |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| solo | gs_annotation | 3% (10386) | 10% (10386) | 30% (1010) | 0.65 | 0.66 | 89% (180) | 73% (161) | 15.6 | 98% (7554) | 81% (577) | - |
| solo | gs_mic | 5% (10236) | 16% (10236) | 29% (1640) | 0.65 | 0.64 | 93% (180) | 67% (167) | 14.8 | 79% (9495) | 46% (865) | 59% (1304) |
| strummed | gs_annotation | 71% (10386) | 85% (10386) | 83% (8790) | 0.76 | 0.78 | 96% (180) | 82% (173) | 13.4 | 99% (24211) | 89% (912) | - |
| strummed | gs_mic | 69% (10236) | 83% (10236) | 83% (8514) | 0.75 | 0.79 | 92% (180) | 85% (166) | 13.5 | 75% (24674) | 50% (835) | - |
