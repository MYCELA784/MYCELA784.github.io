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

---

## Q2 — SKF 322xx tapered-roller block  (`scripts/data-fixes/02-skf-322xx-quarantine.json`)

18 SKF rows `32220`–`32264` carried a **verbatim copy of the `302xx`
series' specs** (`SKF-32220` byte-identical to `SKF-30202`, `SKF-32224` to
`SKF-30205`, `SKF-32240` to `SKF-30212`, …). A real `322NN` is a large
tapered roller — `32224` is 120 mm bore, not 25. **`bore`, `od`, `w`,
`cr`, `c0r` all set to `null`** on the 18 rows (js/db.js then drops them
from the searchable set); the pn and `source` are kept for re-sourcing.
The clean `302xx` originals are untouched.

| id | pn | stored (bore/od/w/cr/c0r) — actually 302xx data | real bore |
|---|---|---|---|
| SKF-32220 | 32220 | 15/35/11.75/18.5/14.6 | ~100 mm |
| SKF-32221 | 32221 | 17/40/13.25/23.4/18.6 | ~105 mm |
| SKF-32222 | 32222 | 20/47/15.25/34.1/28 | ~110 mm |
| SKF-32224 | 32224 | 25/52/16.25/38.1/33.5 | ~120 mm |
| SKF-32226 | 32226 | 28/58/17.25/46.6/41.5 | ~130 mm |
| SKF-32228 | 32228 | 30/62/17.25/50/44 | ~140 mm |
| SKF-32230 | 32230 | 35/72/18.25/63.2/56 | ~150 mm |
| SKF-32232 | 32232 | 40/80/19.75/75.8/68 | ~160 mm |
| SKF-32234 | 32234 | 45/85/20.75/81.6/76.5 | ~170 mm |
| SKF-32236 | 32236 | 50/90/21.75/93.1/91.5 | ~180 mm |
| SKF-32238 | 32238 | 55/100/22.75/111/106 | ~190 mm |
| SKF-32240 | 32240 | 60/110/23.75/120/114 | ~200 mm |
| SKF-32244 | 32244 | 65/120/24.75/141/134 | ~220 mm |
| SKF-32248 | 32248 | 70/125/26.25/155/156 | ~240 mm |
| SKF-32252 | 32252 | 75/130/27.25/171/176 | ~260 mm |
| SKF-32256 | 32256 | 80/140/28.25/184/183 | ~280 mm |
| SKF-32260 | 32260 | 85/150/30.5/216/220 | ~300 mm |
| SKF-32264 | 32264 | 90/160/32.5/240/245 | ~320 mm |
