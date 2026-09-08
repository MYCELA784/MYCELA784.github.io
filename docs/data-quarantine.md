# Data quarantine

Values in `bearings_db.js` that were found corrupt and **nulled rather than
guessed**, per the rule "a missing value is safer than a false one". Each
entry needs re-sourcing from the manufacturer catalogue.

The edits are applied by `scripts/apply-data-fixes.js` from the changesets
in `scripts/data-fixes/`. Every other byte of `bearings_db.js` is untouched.

Web verification against the SKF / NTN online catalogues was attempted and
was not reachable (404 / JS-rendered pages), so everything below is nulled,
not corrected.

**Summary**

| id | scope | action |
|---|---|---|
| Q1 | 40 NTN cylindrical-roller rows | `cr` + `c0r` → null |
| Q2 | 18 SKF `322xx` rows | `bore/od/w/cr/c0r` → null (dropped from search) |
| Q3 | 9 NTN `U+FF09` rows deleted; 6 siblings | rows removed; siblings' `cr`+`c0r` → null |
| Q4a | 11 SKF `618xx/619xx MA` rows | `w` inch → mm (**corrected**, not nulled) |
| Q4b | 42 NTN `5xxxS` rows | reviewed, unchanged (already correct mm) |
| Q5 | `SKF-205_EC` | `type` corrected; `apps` still wrong (flagged) |
| Q6 | 22 duplicate-id rows (11 ids × 2) | all rows deleted (corrupt table region scraped twice) |
| Q7 | 11 SKF `618xx/619xx MA` rows | `cr` + `c0r` lbf column → N (**corrected** from the SKF catalogue PDF) |

Record count: 3715 extracted → **3706** after Q3 → **3684** after Q6.
After `js/db.js`'s load-time sanity filter drops 18 malformed rows, the
live searchable catalogue is **3666** and every `id` is now unique.

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

---

## Q3 — NTN U+FF09 malformed-pn rows  (`scripts/data-fixes/03-ntn-fullwidth-paren.json`)

9 NTN rows whose `pn` ended in `）` （a full-width right parenthesis
left by PDF extraction）. **All 9 rows deleted** (3715 → 3706). Deleting
the extraction artifact itself needs no value verification.

6 of them had an exact clean-pn sibling **with a conflicting `cr`/`c0r`**;
the sibling was kept and its `cr`/`c0r` **nulled** (the conflict proves
one source was wrong and there is no way to tell which):

| deleted row | was cr/c0r | kept sibling | sibling was cr/c0r → now |
|---|---|---|---|
| `4T-32203R2）` | 26.2 / 28.2 | NTN-4T_32203R2 | 16 / 14 → null / null |
| `4T-32205R2）` | 38 / 43 | NTN-4T_32205R2 | 18 / 15 → null / null |
| `4T-32205CR2）` | 34.5 / 42 | NTN-4T_32205CR2 | 18 / 15 → null / null |
| `4T-32306CR2）` | 70 / 88.5 | NTN-4T_32306CR2 | 27 / 23 → null / null |
| `4T-32207CR2）` | 62 / 78.5 | NTN-4T_32207CR2 | 23 / 18 → null / null |
| `322382）` | 1000 / 1670 | NTN-322382 | 92 / 75 → null / null |

3 had **no sibling** — deleted outright; the underlying designation may be
real and is now absent, flagged for re-sourcing:

- `5205SCZZ3）` (25×52×20.6) — possibly `5205SCZZ3`
- `5208SCZZ3）` (40×80×30.2) — possibly `5208SCZZ3`
- `32912XA2）` (60×85×17) — possibly `32912XA2`

Note: `NTN-322382` itself looks like a typo of `NTN-32238` (190×340×97,
which matches) — flagged, not renamed.

---

## Q4 — inch contamination

### Q4a — SKF 618xx/619xx MA widths: CONVERTED  (`scripts/data-fixes/04-skf-618xx-inch-width.json`)

11 large thin-section SKF DGBB rows had `w` stored as an **inch value
labelled mm** (a 400 mm-bore bearing listed as 1.8 mm wide). `w := w ×
25.4`; every result lands on an integer and matches the published SKF
width. `bore` and `od` were already correct and are unchanged. **`cr` and
`c0r` on these same 11 rows were NOT correct — see Q7.**

| id | pn | bore | w before (in) | w after (mm) |
|---|---|---|---|---|
| SKF-61938_MA | 61938 MA | 190 | 1.2992 | 33 |
| SKF-61880_MA | 61880 MA | 400 | 1.811 | 46 |
| SKF-61888_MA | 61888 MA | 440 | 1.811 | 46 |
| SKF-61988_MA | 61988 MA | 440 | 2.9134 | 74 |
| SKF-61892_MA | 61892 MA | 460 | 2.2047 | 56 |
| SKF-61992_MA | 61992 MA | 460 | 2.9134 | 74 |
| SKF-61896_MA | 61896 MA | 480 | 2.2047 | 56 |
| SKF-61996_MA | 61996 MA | 480 | 3.0709 | 78 |
| SKF-619___500_MA | 619 / 500 MA | 500 | 3.0709 | 78 |
| SKF-618___750_MA | 618 / 750 MA | 750 | 3.0709 | 78 |
| SKF-618___800_MA | 618 / 800 MA | 800 | 3.2283 | 82 |

### Q4b — NTN 5xxxS family: reviewed, NOT converted

42 NTN `5xxxS` / `5xxxSCZZ` rows (double-row angular-contact, inch-heritage
series) were flagged by the audit for non-half-integer widths (14.3, 15.9,
20.6 mm …). **These were not converted.** `w × 25.4` gives 363–1250 mm for
10–80 mm-bore bearings — physically impossible — so the stored values are
already mm, not inches; they are the correct non-round catalogue figures
for this series (14.3 mm = 9/16″, etc.). Converting them would manufacture
false data. Left unchanged pending a decision; if any are genuinely wrong
they need per-row re-sourcing, not a blanket ×25.4.

---

## Q5 — SKF-205_EC misclassified type  (`scripts/data-fixes/05-skf-205ec-type.json`)

One SKF row (`pn` `205 EC`, 25 × 52 × 15 mm, `cr` 32.5 / `c0r` 27) was
stored as `type` **"Spherical Roller Thrust"**. That is wrong on every
count: the `EC` suffix is SKF's single-row cylindrical-roller internal
design, the 25/52/15 envelope is the NU 205 / N 205 dimension series, and
the radial load ratings are inconsistent with a thrust bearing. `type :=
"Cylindrical Roller"` (**corrected**, not nulled).

**Still wrong, flagged not fixed:** the `apps` array is unchanged and
still carries thrust-bearing tags — `["vertical shaft applications",
"extruders", "mixers", "heavy axial loads"]`. A cylindrical roller
bearing takes radial load; "heavy axial loads" in particular is
misleading. Needs re-sourcing to the correct application set; left for a
follow-up so this fix stays a single reviewable field change.

This is the first `set` of a non-numeric field, so
`scripts/apply-data-fixes.js` was extended to accept string values
(regex now matches a quoted-string literal; output goes through
`JSON.stringify`). Number/null behaviour is unchanged.

---

## Q6 — duplicate-id rows  (`scripts/data-fixes/06-duplicate-id-block.json`)

`bearings_db.js` carried **11 ids twice — 22 rows — none of them real
parts.** All 22 deleted (3706 → 3684). No dedupe: there is no correct
record to keep, so both copies of each id go.

**Block A — a corrupt NTN inch-series table region, scraped twice
(raw rows 860–879, 10 ids).** Every row: `bore` 10, `pn` a bare round
number that is not a valid NTN designation, no `source` field, and the
identical canned `apps`
`["automotive","gearboxes","wheel hubs","construction","heavy machinery","axles"]`.
Rows 862–871 repeat `{8200, 8100, 7600, 8400, 7400}`; rows 872–879 repeat
`{6400, 6000, 5000, 5800}`; rows 860–861 are `12000` twice, adjacent.

| id | pn | type | d×D×B (mm) | pair |
|---|---|---|---|---|
| NTN-12000 | 12000 | Tapered Roller | 10×45.237×15.494 | identical |
| NTN-8200 | 8200 | Thrust Ball | 10×61.912 / 62×19.05 | OD differs (raw inch vs rounded) |
| NTN-8100 | 8100 | Thrust Ball | 10×64.292×21.433 | identical |
| NTN-7600 | 7600 | Angular Contact Ball | 10×69.85×23.812 | identical |
| NTN-8400 | 8400 | Tapered Roller | 10×62×16.002 | identical |
| NTN-7400 | 7400 | Angular Contact Ball | 10×69.012×19.845 | identical |
| NTN-6400 | 6400 | Deep Groove Ball | 10×73.431×19.558 | identical |
| NTN-6000 | 6000 | Deep Groove Ball | 10×82.931 / 82.55×23.812 | OD differs |
| NTN-5000 | 5000 | Tapered Roller | 10×96.838×21 | identical |
| NTN-5800 | 5800 | Tapered Roller | 10×85×20.638 | identical |

A 10 mm-bore bearing with a 45–97 mm OD and part number "5000" or "8200"
is not a catalogue part. `NTN-5000` claims 10×96.838×21 — an OD nearly
ten times the bore on a "21 mm wide" row. The whole block is extraction
noise, doubled.

**Block B — `FAG-1154`, raw rows 3702–3703, byte-identical.** `pn` "1154"
(not a valid FAG designation), `type` Angular Contact Ball, 15×50×27,
`cr` null, `c0r` null, `mass` 523977 (≈524 tonnes). One corrupt row
emitted twice.

To re-source: if any of these eleven designations turn out to be real
(unlikely for the bare-number NTN ids), they need a fresh pull from the
manufacturer catalogue — there is nothing here to correct.

`scripts/apply-data-fixes.js` gained a `delete_all` op for this: `delete`
still aborts on a non-unique id, `delete_all` removes every row carrying
the id.

---

## Q7 — SKF 618xx/619xx MA load ratings  (`scripts/data-fixes/07-skf-618xx-619xx-ma-loads.json`)

The same glued PDF token that put an inch value in `w` on these 11 rows
(Q4a) shifted every following column one place left, so `cr` and `c0r`
were read from the **lbf** column instead of the **N** column and divided
by 1000 — landing ~4.45× too low (the N→lbf factor). Q4a fixed `w` and
left the loads.

`cr` and `c0r` **set** from the SKF catalogue PDF (US 2025, pp. 52 & 55),
N column ÷ 1000. Not nulled — the real values are in the source.

| id | pn | cr was → now (kN) | c0r was → now (kN) |
|---|---|---|---|
| SKF-61938_MA | 61938 MA | 26.29 → 117 | 30.11 → 134 |
| SKF-61880_MA | 61880 MA | 55.51 → 247 | 91.01 → 405 |
| SKF-61888_MA | 61888 MA | 57.3 → 255 | 98.88 → 440 |
| SKF-61892_MA | 61892 MA | 71.69 → 319 | 128.09 → 570 |
| SKF-61896_MA | 61896 MA | 73.03 → 325 | 134.83 → 600 |
| SKF-61988_MA | 61988 MA | 92.13 → 410 | 161.8 → 720 |
| SKF-61992_MA | 61992 MA | 95.06 → 423 | 168.54 → 750 |
| SKF-61996_MA | 61996 MA | 100.9 → 449 | 183.15 → 815 |
| SKF-619___500_MA | 619 / 500 MA | 103.82 → 462 | 194.38 → 865 |
| SKF-618___750_MA | 618 / 750 MA | 118.43 → 527 | 280.9 → 1250 |
| SKF-618___800_MA | 618 / 800 MA | 125.62 → 559 | 307.87 → 1370 |

Verified against untouched series neighbours: every new value sits between
its smaller and larger neighbour in both `cr` and `c0r` (e.g. `61938 MA`
cr 117 between `61936 MA` 119 and `61940 MA` 148; `618/750 MA` cr 527
between `618/560 MA` 345 and `618/850 MA` 559). Every replaced value was
3–5× below the nearest neighbour.

Integers land unquoted (`"cr":117`), same as Q4a's `w` values; the
downstream assembler normalises numeric formatting.
