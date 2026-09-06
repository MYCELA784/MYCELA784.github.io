# Data quarantine

Values in `bearings_db.js` that were found corrupt and **nulled rather than
guessed**, per the rule "a missing value is safer than a false one". Each
entry needs re-sourcing from the manufacturer catalogue.

The edits are applied by `scripts/apply-data-fixes.js` from the changesets
in `scripts/data-fixes/`. Every other byte of `bearings_db.js` is untouched.

Web verification against the SKF / NTN online catalogues was attempted and
was not reachable (404 / JS-rendered pages), so everything below is nulled,
not corrected.

---

## Q1 — NTN cylindrical-roller load ratings  (`scripts/data-fixes/01-ntn-cyl-roller-loads.json`)

40 NTN `Cylindrical Roller` rows had corrupt `cr` and/or `c0r`. **Both
`cr` and `c0r` set to `null` on all 40** (once either rating on a row is
wrong the pair is untrustworthy). Dimensions on these rows look correct
and are unchanged.

Two failure patterns:

**A. `cr` physically impossible** — a single-digit kN dynamic rating on a
40–150 mm-bore cylindrical roller (real values are 80–700+ kN). 19 rows:

| id | pn | bore×od×w | was cr | was c0r |
|---|---|---|---|---|
| NTN-NU2207E | NU2207E | 35×72×23 | 0.6 | 61.5 |
| NTN-NU2308E | NU2308E | 40×90×33 | 1.12 | 1.2 |
| NTN-NU2309E | NU2309E | 45×100×36 | 1.34 | 1.5 |
| NTN-NU409 | NU409 | 45×120×29 | 1.05 | 1 |
| NTN-NU2320 | NU2320 | 100×215×73 | 4.02 | 4.95 |
| NTN-NU2320E | NU2320E | 100×215×73 | 5.59 | 7.01 |
| NTN-NU322E | NU322E | 110×240×50 | 4.41 | 5.15 |
| NTN-NU2322 | NU2322 | 110×240×80 | 5.93 | 7.75 |
| NTN-NU2322E | NU2322E | 110×240×80 | 6.62 | 8.63 |
| NTN-NU2324 | NU2324 | 120×260×86 | 6.96 | 9.02 |
| NTN-NU2226E | NU2226E | 130×230×64 | 5.2 | 7.21 |
| NTN-NU326 | NU326 | 130×280×58 | 5.49 | 6.52 |
| NTN-NU326E | NU326E | 130×280×58 | 6.03 | 7.21 |
| NTN-NU2228E | NU2228E | 140×250×68 | 5.64 | 8.19 |
| NTN-NU328 | NU328 | 140×300×62 | 6.03 | 7.3 |
| NTN-NU328E | NU328E | 140×300×62 | 6.52 | 7.79 |
| NTN-NU2230E | NU2230E | 150×270×73 | 6.47 | 9.61 |
| NTN-NU330 | NU330 | 150×320×65 | 6.52 | 7.89 |
| NTN-NU330E | NU330E | 150×320×65 | 7.45 | 9.02 |

**B. `c0r` was the sentinel `1`** and `cr` was internally plausible but
unverifiable (a smoothly increasing 645–975 kN series). `cr` nulled too
because it cannot be checked against any source. 21 rows:

| id | pn | bore×od×w | was cr | was c0r |
|---|---|---|---|---|
| NTN-NU2324E | NU2324E | 120×260×86 | 795 | 1 |
| NTN-NU2326 | NU2326 | 130×280×93 | 840 | 1 |
| NTN-NU2326E | NU2326E | 130×280×93 | 920 | 1 |
| NTN-NU2328 | NU2328 | 140×300×102 | 920 | 1 |
| NTN-NU332E | NU332E | 160×340×68 | 860 | 1 |
| NTN-NU2234 | NU2234 | 170×310×86 | 715 | 1 |
| NTN-NU2234E | NU2234E | 170×310×86 | 965 | 1 |
| NTN-NU334 | NU334 | 170×360×72 | 795 | 1 |
| NTN-NU2236 | NU2236 | 180×320×86 | 745 | 1 |
| NTN-NU336 | NU336 | 180×380×75 | 905 | 1 |
| NTN-NU2238 | NU2238 | 190×340×92 | 830 | 1 |
| NTN-NU338 | NU338 | 190×400×78 | 975 | 1 |
| NTN-NU240E | NU240E | 200×360×58 | 765 | 1 |
| NTN-NU2240 | NU2240 | 200×360×98 | 925 | 1 |
| NTN-NU340 | NU340 | 200×420×80 | 975 | 1 |
| NTN-NU244 | NU244 | 220×400×65 | 760 | 1 |
| NTN-NU248 | NU248 | 240×440×72 | 935 | 1 |
| NTN-NU1052 | NU1052 | 260×400×65 | 645 | 1 |
| NTN-NU1056 | NU1056 | 280×420×65 | 660 | 1 |
| NTN-NU1060 | NU1060 | 300×460×74 | 855 | 1 |
| NTN-NU1064 | NU1064 | 320×480×74 | 875 | 1 |
