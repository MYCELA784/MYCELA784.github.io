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
| Q8 | 139 FAG DGBB rows | `bore` unstuck from a frozen 75 → derived from the designation (**corrected**) |
| Q9 | 29 DGBB rows (28 NTN, 1 SKF) | `rpm` implausible for the size; **not changed**, candidates for re-sourcing; calculator gated off |
| Q9b | 26 SKF `32xx` / `33xx` rows | typed `Deep Groove Ball`, catalogue says double-row angular contact; `type` **not changed**, calculator gated off by designation |
| Q9c | 38 SKF `70/…`, `718/…`, `719/…` rows | typed `Deep Groove Ball`, catalogue says angular contact; `type` **not changed**, calculator gated off by designation (radial-only `P = Fr` is wrong for these) |
| Q10 | "Max Axial Load" spec on 3,605 rows | display-time guideline presented as a per-bearing rating; **removed** from both renderers (no data edited) |

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

---

## Q8 — FAG bore frozen at 75 mm  (`scripts/data-fixes/08-fag-618xx-619xx-bore-freeze.json`)

`extract_fag.py`'s bore tracker (`current_d`) froze at 75 mm partway
through the FAG large-DGBB tables and every later row inherited it. **139
FAG rows** carry `bore` 75 against a designation that says otherwise —
every 60xx / 62xx / 63xx / 64xx / 160xx / 618xx / 619xx row from bore
code 16 (80 mm) upward, including the `-2RSR` / `-2Z` / `-Y` / `-M`
variants. The last correct bore is 75 (the code-15 bearings); it recovers
at the next section.

**Only `bore` is wrong.** `od`, `w`, `cr`, `c0r`, `pu` on these rows are
correct for the real bearing. Cross-check: all 139 have a row with the
**identical base designation** in the SKF data; for **139 / 139** the FAG
`od` and `w` match SKF's, and SKF's `bore` equals the derived value.

`bore` **set** to the designation-encoded value — code × 5 for codes ≥ 04
(00/01/02/03 → 10/12/15/17; none of the 139 fall in that range). Not
nulled — the bore is fully determined by the part number.

| derived bore | n | designation codes |
|---|---|---|
| 80 | 14 | …16 |
| 85 | 14 | …17 |
| 90 | 14 | …18 |
| 95 | 12 | …19 |
| 100 | 12 | …20 |
| 105 | 11 | …21 |
| 110 | 11 | …22 |
| 120 | 9 | …24 |
| 130 | 8 | …26 |
| 140 | 5 | …28 |
| 150 | 6 | …30 |
| 160 | 6 | …32 |
| 170 | 5 | …34 |
| 180 | 4 | …36 |
| 190 | 3 | …38 (incl. 61938) |
| 200 | 3 | …40 |
| 220 | 1 | 61944 |
| 240 | 1 | 61948 |

The extractor bug itself is fixed separately in
`D:\IDEA 101\Data Base Building\Bearings\extract_fag.py` so a future
run does not reproduce the freeze — see that folder's
`docs/pipeline-archaeology.md`.

---

## Q9 — implausible limiting speed on 29 DGBB rows  (candidates, **no changeset**)

Unlike Q1–Q8 nothing in `bearings_db.js` is edited for this one. It is
logged so the rows get re-sourced; the only action taken is that the modal
load calculator will not run on them (`DGBBCalc.supports()`, floor
`MIN_N_DM = 275 000` in `js/dgbb_calc.js`, derivation in the comment
there and reproduced by `tests/dgbb.js`).

**What was found.** 29 `Deep Groove Ball` rows have a stored `rpm` (the
limiting speed) that cannot be one. The size-independent test is the
speed factor n·dm (`rpm × 0.5·(bore+od)`): across the 784 DGBB rows that
carry every field the calculator needs, the median is 636 500 and the
lower quartile 519 625. These 29 sit between 6 000 and 261 000; the next
row up is 313 600. NTN-6201 is the type case, stored at 620 rpm on a
12 mm bore where the real limit is near 24 000.

**Pattern.** 18 of the 29 carry an `rpm` equal, to within 3% and mostly
to the digit, to `cr` converted from kN to kgf (× 101.97): NTN-6201
`cr` 6.1 kN = 622 kgf, stored rpm 620; NTN-6301 9.7 kN = 989 kgf, stored
990; NTN-6202 7.75 kN = 790 kgf, stored 790. That looks like the
extractor reading the kgf load column into the speed field. It is a
hypothesis about the cause, **not** a correction: the true limiting
speeds still have to come from the NTN catalogue. Control: only 6 of the
other 755 eligible rows match `rpm ≈ cr` in kgf, and those are 45–105 mm
bearings with an ordinary four-figure limiting speed (SKF-6018 6 300,
FAG-6213 6 300 and so on): coincidence, not the same fault.

The other 11 do not fit the kgf pattern: NTN-6013 / 6014 / 6015 / 6016
(65–80 mm bore, 570–900 rpm against `cr` 30–47 kN), NTN-16030 / 16032 /
6848 / 6852 (150–260 mm bore, 600–900 rpm), NTN-6701 / 6702 (12–15 mm,
7 600–9 500 rpm) and SKF-3200_A.

**Where they are.** 28 of 29 are NTN and 26 of those are in the first
110 rows of the file (22 at indices 2–74, 4 at 100–109), where 103 NTN DGBB rows
carry an `rpm`, so roughly a quarter of that head section. Not a single
contiguous block: also two rows at indices 844–845 (NTN-6701 / 6702) and
SKF-3200_A at index 1327.

| id | pn | bore×od | stored rpm | n·dm | cr [kN] | rpm ≈ cr in kgf |
|---|---|---|---|---|---|---|
| SKF-3200_A | 3200 A | 10×30 | 300 | 6,000 | 0.007 | no |
| NTN-6002 | 6002 | 15×32 | 570 | 13,395 | 5.6 | yes |
| NTN-6201 | 6201 | 12×32 | 620 | 13,640 | 6.1 | yes |
| NTN-16003 | 16003 | 17×35 | 695 | 18,070 | 6.8 | yes |
| NTN-6003 | 6003 | 17×35 | 695 | 18,070 | 6.8 | yes |
| NTN-6904 | 6904 | 20×37 | 650 | 18,525 | 6.4 | yes |
| NTN-6202 | 6202 | 15×35 | 790 | 19,750 | 7.75 | yes |
| NTN-6807 | 6807 | 35×47 | 500 | 20,500 | 4.9 | yes |
| NTN-6905 | 6905 | 25×42 | 715 | 23,953 | 7.05 | yes |
| NTN-6301 | 6301 | 12×37 | 990 | 24,255 | 9.7 | yes |
| NTN-16004 | 16004 | 20×42 | 810 | 25,110 | 7.9 | yes |
| NTN-6203 | 6203 | 17×40 | 980 | 27,930 | 9.6 | yes |
| NTN-6809 | 6809 | 45×58 | 550 | 28,325 | 5.35 | yes |
| NTN-6906 | 6906 | 30×47 | 740 | 28,490 | 7.25 | yes |
| NTN-6004 | 6004 | 20×42 | 955 | 29,605 | 9.4 | yes |
| NTN-16005 | 16005 | 25×47 | 855 | 30,780 | 8.35 | yes |
| NTN-6810 | 6810 | 50×65 | 670 | 38,525 | 6.6 | yes |
| NTN-6907 | 6907 | 35×55 | 975 | 43,875 | 9.55 | yes |
| NTN-6013 | 6013 | 65×100 | 570 | 47,025 | 30.5 | no |
| NTN-6811 | 6811 | 55×72 | 900 | 57,150 | 8.8 | yes |
| NTN-6015 | 6015 | 75×115 | 700 | 66,500 | 39.5 | no |
| NTN-6014 | 6014 | 70×110 | 900 | 81,000 | 38 | no |
| NTN-6016 | 6016 | 80×125 | 850 | 87,125 | 47.5 | no |
| NTN-16032 | 16032 | 160×240 | 600 | 120,000 | 99 | no |
| NTN-6702 | 6702 | 15×21 | 7600 | 136,800 | 0.94 | no |
| NTN-6701 | 6701 | 12×18 | 9500 | 142,500 | 0.93 | no |
| NTN-16030 | 16030 | 150×225 | 850 | 159,375 | 96.5 | no |
| NTN-6848 | 6848 | 240×300 | 650 | 175,500 | 85 | no |
| NTN-6852 | 6852 | 260×320 | 900 | 261,000 | 87 | no |

**Confidence within the 29.** The 23 rows at or below n·dm 87 125 are
unambiguous. The last six (NTN-16032, 6702, 6701, 16030, 6848, 6852, n·dm
120 000 to 261 000) are gap-based: they are excluded by the same outlier
fence as the rest, and every FAG and SKF row sits above 313 600, but the
data alone cannot say whether those six are wrong or merely low. Excluding
them errs towards no calculator. To gate only the unambiguous 23, set
`MIN_N_DM` to 100 000.

**Related.** `SKF-3200_A` is also one of the 26 mistyped rows in Q9b below
(and has `cr` 0.007 kN); it is gated by both rules.

---

## Q9b — SKF 32xx / 33xx typed `Deep Groove Ball`  (candidates, **no changeset**)

26 SKF rows carry `type: "Deep Groove Ball"` but are **double-row angular
contact ball bearings**. The `type` field is left as it is in this pass;
the modal load calculator is switched off for them by designation
(`NOT_DEEP_GROOVE` in `js/dgbb_calc.js`, `/^3[23]\d{2}(?!\d)/` on the
whitespace-stripped designation).

**Verified against the SKF US Bearings Catalog**
(`SKF Catalog_pdf_preview_medium.pdf`, printed page numbers), not by
designation pattern alone:

| printed page | catalogue heading | designations | rows |
|---|---|---|---|
| 81 | Double row, 40° contact angle — Angular contact ball bearings, Series 3308 DNRCBM – 3313 DNRCBM | 3308, 3309, 3310, 3311, 3313 DNRCBM | 5 |
| 82 | Double row, 30° contact angle — Series 3200 A – 3220 A | 3200 A | 1 |
| 83 | Double row, 30° contact angle — Series 3302 A – 3322 A | 3302 A … 3322 A | 20 |

The dimensions and ratings stored on the rows match the catalogue (for
example 3309 DNRCBM: 45×100×39.7, C 61 800 N, C0 52 000 N, reference speed
6 000, limiting 6 300). The extractor's own CSV
(`0901d196807026e8_pdf_preview_medium_skf_bearings.csv`) also types all 26
`Angular Contact Ball`, so the type was lost after extraction: the assembler
(`assemble_db.py`) passes `type` through unchanged from the site's previous
`bearings_db.js`, which is where it was already wrong.

**What the calculator would have got wrong, and what it would not.** At
`Fa = 0` (the only case it supports) `calcP` returns `P = Fr` and never
reads the deep-groove X/Y factors, and `p = 3` is right for any ball
bearing, so for a *double*-row angular contact bearing under a pure radial
load the L10h arithmetic is not itself wrong. It is gated anyway because
the section is scoped to deep groove ball bearings, the `0.01·Cr` minimum
load is a deep-groove guideline, and nothing in the validation covered this
family. (For *single*-row angular contact the radial-only `P = Fr` **is**
wrong: see the note below on `70/…` and `719/…`.)

| id | pn | bore×od×w | cr [kN] |
|---|---|---|---|
| SKF-3308_DNRCBM | 3308 DNRCBM | 40×90×36.5 | 49.4 |
| SKF-3309_DNRCBM | 3309 DNRCBM | 45×100×39.7 | 61.8 |
| SKF-3310_DNRCBM | 3310 DNRCBM | 50×110×44.4 | 81.9 |
| SKF-3311_DNRCBM | 3311 DNRCBM | 55×120×49.2 | 95.6 |
| SKF-3313_DNRCBM | 3313 DNRCBM | 65×140×58.7 | 138 |
| SKF-3200_A | 3200 A | 10×30×14 | 0.007 |
| SKF-3302_A | 3302 A | 15×42×19 | 15.1 |
| SKF-3303_A | 3303 A | 17×47×22.2 | 21.6 |
| SKF-3304_A | 3304 A | 20×52×22.2 | 23.6 |
| SKF-3305_A | 3305 A | 25×62×25.4 | 32 |
| SKF-3306_A | 3306 A | 30×72×30.2 | 42.5 |
| SKF-3307_A | 3307 A | 35×80×34.9 | 52 |
| SKF-3308_A | 3308 A | 40×90×36.5 | 64 |
| SKF-3309_A | 3309 A | 45×100×39.7 | 75 |
| SKF-3310_A | 3310 A | 50×110×44.4 | 90 |
| SKF-3311_A | 3311 A | 55×120×49.2 | 112 |
| SKF-3312_A | 3312 A | 60×130×54 | 127 |
| SKF-3313_A | 3313 A | 65×140×58.7 | 146 |
| SKF-3314_A | 3314 A | 70×150×63.5 | 163 |
| SKF-3315_A | 3315 A | 75×160×68.3 | 176 |
| SKF-3316_A | 3316 A | 80×170×68.3 | 193 |
| SKF-3317_A | 3317 A | 85×180×73 | 208 |
| SKF-3318_A | 3318 A | 90×190×73 | 208 |
| SKF-3319_A | 3319 A | 95×200×77.8 | 240 |
| SKF-3320_A | 3320 A | 100×215×82.6 | 255 |
| SKF-3322_A | 3322 A | 110×240×92.1 | 291 |

---

## Q9c — SKF 70/…, 718/…, 719/… typed `Deep Groove Ball`  (candidates, **no changeset**)

38 SKF rows carry `type: "Deep Groove Ball"` but are **angular contact ball
bearings** (bores 500–1250 mm). As with Q9b the `type` field is left alone
and the modal load calculator is switched off for them by designation
(`NOT_DEEP_GROOVE` in `js/dgbb_calc.js`, the `7\d` branch: any designation
that starts with 7 after whitespace is stripped; no ISO 15 deep groove
designation does). The regex matches these 38 and nothing else in the data.

**Verified against the SKF US Bearings Catalog**
(`SKF Catalog_pdf_preview_medium.pdf`, printed page numbers), not by
designation pattern alone:

| printed page | catalogue heading | rows |
|---|---|---|
| 68 | Single row, Angular contact ball bearings, Series 7024 B – 70/1250 AMB | 19 |
| 72 | Single row, Angular contact ball bearings, Series 71964 AC – 719/710 ACMB | 5 |
| 73 | Angular contact ball bearings, Series 71872 AC – 718/1250 AMB (this page does not print "single row"; same product family as pp.68 and 72) | 14 |

The extractor's CSV (`0901d196807026e8_pdf_preview_medium_skf_bearings.csv`)
also types all 38 `Angular Contact Ball`, so, as in Q9b, the wrong type came
in from the site's previous `bearings_db.js`. These 38 plus the 26 in Q9b are
exactly the 64 rows where the CSV type and the DB type disagree, apart from
`NTN-6200` (below).

**Why this one is worse than Q9b.** The calculator supports `Fa = 0` only and
returns `P = Fr`. That is defensible for a double-row angular contact bearing
under a pure radial load (Q9b), but **not** for a single-row one: an angular
contact bearing loaded radially develops an induced axial load, so the real
equivalent load `P = X·Fr + Y·Fa` exceeds `Fr`. Using `P = Fr` therefore
**overstates the life**, in the unsafe direction, and the output looks
entirely plausible. That is the reason these are gated rather than
labelled.

**Checked and not gated** (also typed `Deep Groove Ball`; the catalogue says
they are deep groove): FAG `42xx-BB-TVH` / `43xx-BB-TVH` are titled "Deep
groove ball bearings, double row" (FAG HR 1, PDF p.282), and the calculator's
`Fa = 0` arithmetic is valid for a double-row deep groove bearing; FAG
`622xx-2RSR` is on a "single row" deep groove page (HR 1, PDF p.240);
`60/…`, `62/…`, `63/…`, `618/…`, `619/…` slash-coded sizes are ordinary deep
groove. `NTN-6200` is typed `Deep Groove Ball` by the DB but `Tapered Roller`
by the CSV (its 77.788 mm OD is an inch size); it is already excluded from
the calculator because its `rpm` is null.

| id | pn | bore×od×w | cr [kN] | printed page |
|---|---|---|---|---|
| SKF-70___500_B | 70 / 500 B | 500×720×100 | 637 | 68 |
| SKF-70___530_B | 70 / 530 B | 530×780×112 | 741 | 68 |
| SKF-70___560_AMB | 70 / 560 AMB | 560×820×115 | 793 | 68 |
| SKF-708___600_AMB | 708 / 600 AMB | 600×730×42 | 338 | 68 |
| SKF-70___600_AGMB | 70 / 600 AGMB | 600×870×118 | 884 | 68 |
| SKF-70___630_AMB | 70 / 630 AMB | 630×920×128 | 956 | 68 |
| SKF-70___670_AMB | 70 / 670 AMB | 670×980×136 | 1170 | 68 |
| SKF-70___710_AMB | 70 / 710 AMB | 710×1030×140 | 1190 | 68 |
| SKF-70___750_AMB | 70 / 750 AMB | 750×1090×150 | 1300 | 68 |
| SKF-70___800_AMB | 70 / 800 AMB | 800×1150×155 | 1250 | 68 |
| SKF-70___850_AMB | 70 / 850 AMB | 850×1220×165 | 1380 | 68 |
| SKF-70___900_AMB | 70 / 900 AMB | 900×1280×170 | 1560 | 68 |
| SKF-70___950_AMB | 70 / 950 AMB | 950×1360×180 | 1630 | 68 |
| SKF-70___1000_AMB | 70 / 1000 AMB | 1000×1420×185 | 1630 | 68 |
| SKF-70___1060_AMB | 70 / 1060 AMB | 1060×1500×195 | 1680 | 68 |
| SKF-70___1120_AMB | 70 / 1120 AMB | 1120×1580×200 | 1720 | 68 |
| SKF-70___1180_AMB | 70 / 1180 AMB | 1180×1660×212 | 1740 | 68 |
| SKF-708___1250_AMB | 708 / 1250 AMB | 1250×1500×80 | 806 | 68 |
| SKF-70___1250_AMB | 70 / 1250 AMB | 1250×1750×218 | 1780 | 68 |
| SKF-719___500_AGMB | 719 / 500 AGMB | 500×670×78 | 553 | 72 |
| SKF-719___530_ACM | 719 / 530 ACM | 530×710×82 | 618 | 72 |
| SKF-719___560_AMB | 719 / 560 AMB | 560×750×85 | 592 | 72 |
| SKF-719___600_ACM | 719 / 600 ACM | 600×800×90 | 715 | 72 |
| SKF-719___710_ACMB | 719 / 710 ACMB | 710×950×106 | 852 | 72 |
| SKF-718___500_AM | 718 / 500 AM | 500×620×56 | 390 | 73 |
| SKF-718___530_AMB | 718 / 530 AMB | 530×650×56 | 390 | 73 |
| SKF-718___560_AMB | 718 / 560 AMB | 560×680×56 | 397 | 73 |
| SKF-718___600_AMB | 718 / 600 AMB | 600×730×60 | 449 | 73 |
| SKF-718___670_AMB | 718 / 670 AMB | 670×820×69 | 527 | 73 |
| SKF-718___670_ACMB | 718 / 670 ACMB | 670×820×69 | 553 | 73 |
| SKF-718___710_AMB | 718 / 710 AMB | 710×870×74 | 572 | 73 |
| SKF-718___710_ACMB | 718 / 710 ACMB | 710×870×74 | 605 | 73 |
| SKF-718___750_AGMB | 718 / 750 AGMB | 750×920×78 | 618 | 73 |
| SKF-718___750_ACMB | 718 / 750 ACMB | 750×920×78 | 650 | 73 |
| SKF-718___850_AMB | 718 / 850 AMB | 850×1030×82 | 689 | 73 |
| SKF-718___1000_AMB | 718 / 1000 AMB | 1000×1220×100 | 923 | 73 |
| SKF-718___1120_AMB | 718 / 1120 AMB | 1120×1360×106 | 1060 | 73 |
| SKF-718___1250_AMB | 718 / 1250 AMB | 1250×1500×112 | 1140 | 73 |

---

## Q10 — "Max Axial Load" shown as a per-bearing rating  (**removed**, no changeset)

The modal's spec grid showed **Max Axial Load** on every row with a `c0r`
(3,605 of the 3,666 live rows; the 61 without a `c0r` never showed it).
There is no such field: it is not a key in `bearings_db.js` and no extractor
CSV has an axial column. It was computed at display time in `js/renderer.js`
(and `js-legacy/renderer.js`) as `c0r × 0.5`, or `c0r × 0.25` when the
designation matched `/^6[12][89]/` or `/^600/`, and printed with a `kN` unit
as if it were a catalogue value. It was added in `c562033` ("Fix: DGBB type
correction, add max axial load to modal") with no source cited. SKF's own
product pages publish no such field (per the project owner; not checked from
this machine).

**Removed.** The row is gone from both renderers; nothing in `bearings_db.js`
changes. `tests/dgbb.js` (section 7) fails if a spec, compare or card label
containing "axial" reappears in either renderer, and was checked against the
pre-fix files (both fail on `"Max Axial Load"`). `index.html` `?v=7` → `?v=8`.
`index-legacy.html` loads `js-legacy/renderer.js` with no version tag, so
returning visitors to that page pick the change up on normal HTTP cache
expiry, not on a URL change.

**What the number actually is.** SKF's catalogue does state a rule, printed
p.254 under "Axial load carrying capacity" for deep groove ball bearings:
pure axial load `Fa ≤ 0.5 C0`, and `Fa ≤ 0.25 C0` for small bearings
(`d ≤ 12 mm`; the comparison sign did not survive text extraction) and light
series bearings (diameter series 8, 9, 0 and 1). It adds that "excessive
axial load can lead to a considerable reduction in bearing service life". So
the figure was a guideline for *pure* axial load on *SKF deep groove*
bearings, presented as a rating for every bearing. For the SKF 6205 the shown
3.90 kN (`0.5 × 7.8`) does equal what that rule gives; the field was still
unsourced and mislabelled.

**Where it was wrong.**

| | rows | what was wrong |
|---|---|---|
| Not deep groove | **2,673** | SKF's rule does not apply: angular contact 639, tapered roller 598, spherical roller 364, needle roller 326, thrust ball 227, spherical roller thrust 225, cylindrical roller 177, self-aligning ball 117. E.g. `NTN-51105` (thrust ball, C0 37 kN) showed 18.50 kN, and 58 plain `NU` cylindrical rollers, which carry no axial load by design, showed a number. |
| Deep groove, matches the rule | 651 | correct for SKF's rule (including the 6205) |
| Deep groove, **overstated 2×** | **281** | the regex missed the 0.25 cases: 240 by diameter series alone (`60xx` 105, `160xx` 86, `68xx` 20, `69xx` 19, `60/…` slash sizes 11 and others), 36 by bore ≤ 12 mm alone (miniature and small bores, e.g. 604, 608, 623, 625), 5 by both. By brand NTN 74, SKF 101, FAG 106. |
| Deep groove, understated | 0 | none |

**Direction of the error.** On the 932 deep groove rows it was **never
understated** against SKF's rule (0 of 932): every error was an overstatement
of permissible axial load, by exactly 2×, so all of them in the unsafe
direction. For the 2,673 other rows there is no rule to compare to, so the
direction is not defined; for the plain `NU` rollers it overstated by
construction.

**Also unverified.** SKF's rule was applied to NTN and FAG rows. Their own
catalogues' axial statements were not checked.

**Not restored.** Reinstating it for deep groove only would need the exact
SKF rule (diameter series read from the designation, and the small-bearing
test), a label saying it is a pure-axial-load guideline with its source, and
would still sit directly above a calculator that does not offer axial or
combined loading. Not done; if wanted later it is a display decision to make
deliberately, not a data fix.
