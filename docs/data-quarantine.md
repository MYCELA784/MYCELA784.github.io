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
| Q11 | 297 FAG single row DGBB rows | new field `f0` **added** (FAG's calculation factor, from FAG's own catalogue); enables combined loading for those rows |
| Q12 | NTN `f0` | **candidate, not built**: NTN prints it, but the same row region produced the Q9 corruption |
| Q13 | 12 NTN rows with impossible dimensions | all rows deleted (5 contradicted by SKF/FAG for the same designation, 7 impossible by shape) |
| Q14 | `FAG-80750` | `c0r` 0.005 kN with no `cr`; **logged, not changed** |
| Q15 | `NTN-32217U` | `cr` 36 kN against SKF 32217's 263; **logged, not changed** |
| Q16 | `SKF-24013-2RS5W` | `sealing` Open → Sealed (**corrected**: the designation's `2RS5` is SKF's sealed suffix) |
| Q17 | 60 SKF rows | `type` **corrected**: 53 self-aligning ball rows typed Angular Contact Ball, 7 `511/…` thrust ball rows typed Self-Aligning Ball; 20 `22xx EC`/`23xx EC` rows typed Spherical Roller Thrust **logged, not changed** |
| Q18 | 162 SKF rows typed Spherical Roller Thrust that are not; 16 SKF `213xx` rows typed Cylindrical Roller; `SKF-22264_CC_W33` | `type` **corrected** on 2026-10-10: the 162 to Cylindrical Roller (Q18a), the 16 and 98 more large `23x/` / `24x/` rows to Spherical Roller (Q18b, Q18d); impossible `c0r` set to null (Q18c); the wrong thrust `apps` on the 162 set to null (Q18e). No row deleted or renamed. The 162 still need their real designation (lost `NU` / `NJ` / `NUP` prefix, cage suffix) from SKF's catalogue |

Record count: 3715 extracted → **3706** after Q3 → **3684** after Q6 →
**3672** after Q13. After `js/db.js`'s load-time sanity filter drops 18
malformed rows, the live searchable catalogue is **3654** (3666 before
Q13) and every `id` is unique.

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
`NTN-6200` (below; deleted in Q13).

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
by the CSV (its 77.788 mm OD is an inch size); it was excluded from
the calculator because its `rpm` was null, and the row is now deleted (Q13).

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

---

## Q11 — FAG `f0` added to 297 rows  (`scripts/data-fixes/11-fag-f0-add.json`)

This is a data **addition**, not a quarantine. Nothing is nulled and no existing
value changes: 297 FAG rows gain one new field, `f0`, FAG's calculation factor
for the equivalent-load lookup (`f0·Fa/C0r`). It is what lets the modal
calculator offer combined (radial + axial) loading on those rows.

**Which rows.** Exactly the FAG rows the calculator can run on
(`DGBBCalc.supports`) that are single row bearings: 297. Not the 24 FAG double
row rows (`42xx`/`43xx`), because FAG's catalogue gives no separate factor
table for that series (and the current extractor does not produce the `43xx`
rows at all). The extraction has `f0` for 464 deep groove rows; only the 297
the calculator can use were added, so the data and the UI cover the same rows.

**Where the values come from.** The "Factor f0" column of the deep groove
product tables in FAG's HR 1 catalogue. `extract_fag.py` already parsed it
(`fo`) and dropped it; it now writes it as a trailing `f0` CSV column, for Deep
Groove Ball rows only and inside a plausibility band. Applied through the new
`add` op of `apply-data-fixes.js` (`0e762d8`), from a changeset generated by
`scripts/make-fag-f0-changeset.js`, which matches a row to the CSV by
designation plus bore and OD within 0.5 mm and aborts on any miss or ambiguity.

**How it was checked.**

- *Extractor regression.* Re-running the patched extractor on HR 1 reproduced
  the committed CSV exactly (505 rows, same order, every pre-existing column
  byte-identical) with `f0` as the only difference.
- *Independent re-read.* All 297 values were re-read from the PDF a second way,
  by word geometry and row clustering rather than the extractor's line parse:
  **297 agree, 0 disagree, 0 unresolved.**
- *Range and consistency.* All values lie in 11.0 to 16.6 (median about 14.8).
  115 groups of bearings that share size and load ratings (seal and cage
  variants) all agree on `f0`, 0 exceptions.
- *Applied file.* The new `bearings_db.js` minus the added `,"f0":<n>` slices
  is byte-identical to the previous file; no other field changed on any row.

**Not part of this.** SKF: the project owner will request the data from SKF
directly; nothing is scraped. NTN: see Q12. The assembler
(`assemble_db.py`, in the `bearing_calc` project) now carries `f0` through like
`pu` and refuses it on a non-FAG row; its output is still not what ships.

**How it is used, and the limits.** `js/dgbb_calc.js` computes combined loading
for these rows with FAG's own Table 10 (`js/tables/fag_tables.js`, HR 1 printed
p.231), never with SKF's table. The two tables come from the same ISO curve
but are different numbers: using SKF's with FAG's `f0` moves life by −9.6% to
+5.1% (`bearing_calc` `docs/bearing-calculations.md` §9a-4), which is why they
are kept apart. FAG's table is for normal operating clearance only, so there is
no clearance selector on FAG rows.

---

## Q12 — NTN `f0`  (**candidate, not built**)

NTN's catalogue does print it: the deep groove table has a "Factor" column
headed *f*<sub>o</sub> (printed p.B-10, PDF p.123; the 6205 shows 13.9), and NTN's
worked example (printed p.A-27) says "Basic static load rating Cor for bearing
6208 … is 17.8 kN {1820 kgf} and fo is 14.0", so it is the same equivalent-load
factor. `extract_ntn.py` has no handling for it.

**Deliberately not built in this pass.** That column sits in the row region
where the Q9 corruption arose (the kgf load columns and the speeds, where 18 of
the 29 implausible NTN limiting speeds equal `cr` converted to kgf). A parser
that mis-slots those columns can mis-slot `fo` too, so nothing should be
extracted from that region until Q9 is understood and the NTN row layout is
verified. Before this could be built: fix or explain Q9; verify NTN's own e/X/Y
table (not checked; it must not be mixed with SKF's or FAG's); then extract and
verify as for Q11. Scope if built: NTN's 83 calculator-eligible rows.

---

## Q13 — NTN rows with impossible dimensions  (`scripts/data-fixes/13-ntn-implausible-dimensions.json`)

Found in live testing: `NTN-6200` showed 10 × 77.788 × 19.842 mm, the same
inch contamination as Q6 Block A. **12 rows deleted (3684 → 3672 raw; live
3666 → 3654).** Same approach as Q6: deletion, not correction, because
no value in these rows can be trusted. None of the 12 was referenced
by another row's `alt`, and all 12 were live (the `js/db.js` sanity filter
passed them).

**Why `NTN-6200` survived Q6.** Q6 was found by looking for *duplicate ids*:
Block A's rows had been scraped twice. `NTN-6200` appears once and "6200" is a
valid designation, so that check never saw it. Nothing in the pipeline tested
dimensions for plausibility. The Block A pattern described in Q6 ("no
`source` field") does not help either: no NTN row has a `source` field (0 of
860).

**How the 12 were found.** Three scans over `bearings_db.js`:

1. *Inch-fraction dimensions*: non-integer mm values that are a multiple of
   1/64″. 20 rows, but 19 are genuine metric catalogue values that happen to
   be inch fractions (tapered roller widths 18.25, 38.5, 63.5; 33xx widths
   25.4). Only `NTN-6200` is contaminated. This scan alone is not a usable
   detector.
2. *Same designation at another brand*: each of the 189 NTN rows whose `pn`
   also exists at SKF or FAG was compared on bore/OD/width (±0.6 mm).
   5 mismatches.
3. *Shape*: OD more than 4× the bore, and the Block A pattern (bore 10, a bare
   round number as `pn`).

**Certain: contradicted by SKF/FAG for the same designation (5).**

| id | ours d×D×B (mm) | reference | what went wrong |
|---|---|---|---|
| NTN-6200 | 10 × 77.788 × 19.842 | SKF-6200, FAG-6200-C: 10 × 30 × 9 | OD = 3 1/16″, B = 25/32″; `cr` 57.5 kN (SKF: 5.4), `speed_ref` 4600. The whole row comes from an inch-series tapered table: the extractor's CSV types it `Tapered Roller` (see Q9c). |
| NTN-2310 | 45 × 50 × 9 | SKF-2310: 50 × 110 × 40 | columns shifted: our OD is the real bore, and our bore is 5 mm short |
| NTN-2311 | 50 × 54 × 10 | SKF-2311: 55 × 120 × 43 | same shift |
| NTN-2312 | 55 × 58 × 11 | SKF-2312: 60 × 130 × 46 | same shift |
| NTN-3068 | 340 × 430 × 404 | SKF-3068: 340 × 520 × 133 | width is 0.94 × OD and equals `cr` (404); `c0r` 28 kN on a 340 mm bore |

**Shape-suspect: no cross-reference, impossible on their face (7).**
Recorded with the reasoning so they can be re-sourced if the designations
turn out to be real.

| id | pn / type | ours d×D×B (mm) | reasoning |
|---|---|---|---|
| NTN-1310 | 1310 Self-Aligning Ball | 50 × 280 × 100 | a 1310 is 50 × 110 × 27; an OD of 5.6× the bore is not a self-aligning ball bearing; `cr`/`c0r` null |
| NTN-1410 | 1410 Spherical Roller | 50 × 280 × 109 | same 50 × 280 pair as NTN-1310; OD 5.6× bore; `cr`/`c0r` null; "1410" is not a spherical roller designation |
| NTN-1030 | 1030 Spherical Roller | 150 × 870 × 50 | an OD of 5.8× the bore at 50 mm wide is not a rolling bearing; `cr` 74 kN is far too low for an 870 mm OD |
| NTN-17000 | 17000 Cylindrical Roller | 10 × 47 × 16 | Block A pattern: bore 10, a bare round `pn` that is not an NTN cylindrical roller designation (NTN uses NU/NJ/NUP/N… prefixes) |
| NTN-15000 | 15000 Cylindrical Roller | 10 × 55 × 19 | same pattern |
| NTN-9400 | 9400 Cylindrical Roller | 10 × 80 × 23 | same pattern; OD 8× bore |
| NTN-8600 | 8600 Cylindrical Roller | 10 × 90 × 26 | same pattern; OD 9× bore |

The four bore-10 cylindrical rows have integer, metric-looking dimensions,
which is why the inch scan missed them. They carry the cylindrical roller
canned `apps` list, not Block A's.

**Gaps this leaves.** Real NTN parts that now have no row and need a fresh
pull from the NTN catalogue: **NTN 6200, 2310, 2311, 2312, 3068, 1310.** The
same designations remain searchable at SKF (6200, 2310–2312, 3068) and FAG
(6200). The other six ids (1410, 1030, 17000, 15000, 9400, 8600) are probably
not real NTN designations; re-source only if a catalogue shows otherwise.

**Not done.** No plausibility check was added to `js/db.js` or the extractor,
so another row like these would again pass the load-time filter. The
cross-brand comparison above is the most reliable detector found and could
become a data test.

---

## Q14 — `FAG-80750`: `c0r` 0.005 kN, no `cr`  (**logged, not changed**)

`FAG-80750`, typed `Deep Groove Ball`, 20 × 80 × 25.4 mm, `cr` null,
`c0r` 0.005 kN (5 N), `mass` 36, `source` "FAG Rolling Bearings Catalog".
A 5 N static rating on a 20 × 80 bearing is off by orders of magnitude, and
"80750" is not a standard deep groove designation. Found during the Q13 inch
scan (its 25.4 mm width). Not edited: it needs checking against FAG's
catalogue to decide whether the load is mis-scaled or the whole row is noise.
No calculator runs on it (`cr` and `rpm` are null).

---

## Q15 — `NTN-32217U`: `cr` 36 kN against SKF 32217's 263  (**logged, not changed**)

`NTN-32217U`, tapered roller, 85 × 150 × 38.5 mm: `cr` 36, `c0r` 30,
`rpm` 900. `SKF-32217`, same dimensions: `cr` 263, `c0r` 285, `rpm` 4300.
NTN's value is about 7× too low. The dimensions agree, so this is a
load-column problem, not a bad row like Q13. `NTN-32317U` (85 × 180 × 63.5,
`cr` 60 against SKF-32317's 501) looks like the same fault. Not edited: the
NTN tapered roller loads need checking as a block against NTN's catalogue,
as Q1 did for NTN cylindrical roller loads.

---

## Q16: `SKF-24013-2RS5W`, sealing "Open" on a sealed designation  (`scripts/data-fixes/16-skf-24013-2rs5w-sealing.json`)

`SKF-24013-2RS5W`, spherical roller, 65 × 100 × 35 mm, had `sealing`
"Open". `2RS5` is SKF's suffix for a spherical roller bearing sealed both
sides (`MYCELA.SUFFIX_CODES` in `js/constants.js`); the trailing `W` is a
lubrication feature code, not a seal code. Set to "Sealed". The open
`SKF-24013_CC_W33` row of the same size is unchanged. Found because the
fallback's one card per bearing groups seal variants by designation suffix,
and this was the only Open row the suffix patterns matched.

**Scan of all 3,672 raw rows**, using the seal/shield patterns of
`baseDesignation()` in `js/search/fallback.js` (a separate token `2RS`,
`RS`, `2RS5`, `2RSR`, `2HRS`, `2RZ`, `2Z`, `Z`, `ZZ`, `LLx`, or `ZZ`/`LLU`/
`LLB`/`LLH` glued to an NTN designation):

- Seal/shield suffix but `sealing` Open: **1**, this row. Fixed.
- `sealing` Sealed or Shielded with no suffix: **0**.
- Suffix kind against `sealing` (a `Z`/`2Z`/`ZZ` shield marked Sealed, or a
  seal marked Shielded): **0**.

A broader scan of Open rows for any seal-like letters (RS, Z, LL, DD, VV,
DU, SH, RZ) found one other pattern: `NTN-30315DU` to `NTN-30319DU` (5
tapered roller rows). In NTN tapered designations `D` is the steep contact
angle series and `U` an NTN design code; neither is a seal code, and none
of the catalogue's tapered rollers is sealed. Reviewed, not changed, and no
Q17 was needed.

---

## Q17: wrong `type` on SKF self-aligning ball and thrust ball rows  (`scripts/data-fixes/17-skf-self-aligning-type.json`)

Found in live testing: `SKF-1201_E` and `SKF-1301_E` ranked among the
angular contact results for "angular contact bore 12 od 32". The 12xx, 13xx,
22xx and 23xx four-digit series are self-aligning ball bearings (the 72xx
and 73xx series are angular contact; five-digit 222xx and 223xx are
spherical roller).

**Scan of all 3,672 raw rows** for a four-digit designation starting 12, 13,
22 or 23 with no letter prefix (so `NU 2205` and the five-digit 222xx/223xx
are not matched): 187 rows. 114 already typed Self-Aligning Ball (SKF, NTN
and FAG). The other 73 are all SKF:

**Corrected, Angular Contact Ball → Self-Aligning Ball (53).** Dimensions and
loads match SKF's self-aligning ball tables (1205 E: 25 × 52 × 15, `cr` 14.3;
2205 E: 25 × 52 × 18, `cr` 16.8), and the rows already carry the same `apps`
list as SKF's correctly typed self-aligning rows (e.g. `SKF-1215`).

| series | ids |
|---|---|
| 12xx | `SKF-1200_E` to `SKF-1214_E` (15), `SKF-1224_M`, `SKF-1226_M` |
| 13xx | `SKF-1301_E` to `SKF-1313_E` (13), `SKF-1322_M` |
| 22xx | `SKF-2200_E` to `SKF-2213_E` (14), `SKF-2215_E`, `SKF-2216_E` |
| 23xx | `SKF-2305_E`, `SKF-2307_E`, `SKF-2308_E`, `SKF-2309_E`, `SKF-2317_M`, `SKF-2319_M` |

**Logged, not changed: 20 rows typed Spherical Roller Thrust.**
`SKF-2228_EC`, `2230_EC`, `2232_EC`, `2234_EC`, `2236_EC`, `2238_EC`,
`2240_EC`, `2244_EC`, `2256_EC`, `2264_EC`, `2276_EC`, and `SKF-2304_EC` to
`SKF-2312_EC` (9). They match the four-digit pattern but are not
self-aligning ball bearings: the loads are far too high (`2228 EC`
140 × 250 × 68, `cr` 655; a self-aligning ball bearing of that size would be
well under 200). Size and load fit SKF spherical roller bearings 22228 and
so on, as if the designation lost a digit, and "Spherical Roller Thrust" is
then wrong too (a radial bearing). Both `pn` and `type` look wrong, so they
need checking against SKF's catalogue before any edit. Their `apps` list is
the thrust one ("vertical shaft applications", "heavy axial loads").

**Reverse scan: rows typed Self-Aligning Ball outside the pattern (7),
corrected to Thrust Ball.** `SKF-511___500_F`, `511___530_F`, `511___560_F`,
`511___600_F`, `511___630_F`, `511___670_F`, `511___670_M`. 511 is SKF's
single direction thrust ball series; the other 72 `511xx` rows are already
typed Thrust Ball, and the sections and loads fit (511/500 F: 500 × 600 × 80,
`c0r` 3600 kN). Their `apps` list is still the self-aligning one
(agricultural machinery, fans, conveyors...) and was not changed: this
changeset only sets `type`.

No NTN or FAG row was affected. No row gained or lost the DGBB calculator:
none of the 60 was or became Deep Groove Ball (`tests/dgbb.js` still reports
692 calculable).

---

## Q18: SKF cylindrical roller rows with a lost prefix, typed Spherical Roller Thrust  (changesets `18a` to `18e`: types corrected, wrong `apps` cleared, nothing deleted, nothing renamed)

### Status, 2026-10-10

Changed, with `scripts/apply-data-fixes.js`:

| fix | changeset | rows | change |
|---|---|---|---|
| Q18a | `scripts/data-fixes/18a-skf-cylindrical-type.json` | 162 | `type` Spherical Roller Thrust to Cylindrical Roller |
| Q18b | `scripts/data-fixes/18b-skf-spherical-type.json` | 16 | `type` Cylindrical Roller to Spherical Roller |
| Q18c | `scripts/data-fixes/18c-skf-22264-c0r.json` | 1 | `SKF-22264_CC_W33` `c0r` 49000001101.1 to null (unknown, no value guessed) |
| Q18d | `scripts/data-fixes/18d-skf-large-spherical-type.json` | 98 | `type` Cylindrical Roller to Spherical Roller |
| Q18e | `scripts/data-fixes/18e-skf-cylindrical-apps.json` | 162 | `apps` (the thrust list) to null, on the Q18a rows |

Rows per type, before and after (searchable catalogue, 3,654 rows; the raw
file stays at 3,672):

| type | before | after | change |
|---|---|---|---|
| Cylindrical Roller | 213 | 261 | +48 (+162, -16, -98) |
| Spherical Roller | 368 | 482 | +114 (+16, +98) |
| Spherical Roller Thrust | 225 | 63 | -162 |
| every other type | | | unchanged |

**Q18a, the evidence.** All 162 rows listed below (103 `NNN EC` / `NNNN EC`,
12 `NN / NNN EC`, 22 bare numbers, 25 `NJG ... VH`). Their sizes are those
of radial ISO series (02, 03, 10, 22, 23 ...), `c0r` is close to `cr` where
a real spherical roller thrust row has `c0r` three to four times `cr`
(`29230 E`: 408 / 1600), and for 63 of them an `NU` / `NJ` row of exactly
the same size is in the catalogue. The 63 rows left with the type are all
real `29xxx` / `294/xxx` bearings. The tables below still say "kept,
logged" in the action column: that was the state before this fix.

**Q18b, the evidence.** `21305 CC`, `21306 CC`, `21307 CC` and
`21308 E` to `21320 E`. Series 213 with a `CC` or `E` suffix is SKF's
spherical roller series, the sizes are the 213 sizes, and the ratings are
not those of the cylindrical roller row of the same size, which is in the
catalogue too (`21305 CC` 49.1 / 41.5 against `305 EC` 46.5 / 36.5). The
pairs with the same ratings (`21310 E` and `21311 E`, `21314 E` and
`21315 E`, `21316 E` and `21317 E`, `21319 E` and `21320 E`) are the same
in SKF's catalogue, not an extraction fault. All 16 fit; none was unclear.

**Still to do, needs SKF's catalogue.**

- The real designation of the 137 Q18a rows without a prefix: which of
  `NU`, `NJ` or `NUP` was lost, and the cage suffix after `EC`. Until then
  they are found by size and by type but not by their real part number.
- Their `apps` list, null since Q18e, when `apps` is re-sourced
  (`docs/apps-type-audit.md`). `SKF-205_EC`, retyped by Q5, still carries
  the thrust list; not changed.
- `SKF-22264_CC_W33` `c0r` (null now; the value should be near 4900).
- `2088 EC` has `speed_ref` 8500 against `rpm` 1300, where its neighbours
  have 750 to 850. Not changed.

**Q18d.** The "16 rows" count was short: another 98 SKF rows typed
Cylindrical Roller carried large spherical roller designations, series
`230/`, `231/`, `232/`, `238/`, `239/`, `240/`, `241/`, `248/`, `249/`
from bore 500 mm up (`230/ 500 CA/W33` ... `249 / 1320 CAF/W33`). Every
one has a spherical roller suffix (`CA`, `ECA`, `ECJ`, `CAF`, `ECAF`,
`CAMA`, `CAFA` with `/W33` or `/W20`). The type correction in `js/db.js`
missed them because of the slash. Retyped with the owner's OK. After it, no
SKF row typed Cylindrical Roller is left without an `N` prefix other than
the Q18a rows and `205 EC`.

**Q18e.** The 162 Q18a rows carried the thrust `apps` list ("vertical shaft
applications", "extruders", "mixers", "heavy axial loads"), wrong for a
cylindrical roller bearing. Set to null (unknown) rather than replaced with
a guessed list. Nothing on the site reads `apps` at present. For this,
`set` in `scripts/apply-data-fixes.js` now accepts a list of texts as the
value being replaced (new value still null, a number or a text only);
`tests/apply-data-fixes.js` section 8.

The three NTN rows below (`NTN-22256BK`, `NTN-22264BK`, `NTN-1080`) are
left as they are, already logged.

### As first logged

Follow-up to the 20 rows Q17 logged and did not change (`2228 EC` to
`2276 EC`, `2304 EC` to `2312 EC`), plus `SKF-206_EC` (30 × 62 × 16) and
every other row of the same pattern. The question was whether each is a copy
of a correctly numbered spherical roller row (`2228 EC` a copy of `22228 E`,
with a digit lost), in which case the broken row would be deleted.

**Result: none is a duplicate, so none was deleted.** 162 SKF rows
are typed Spherical Roller Thrust without being one (the other 63 SKF rows of
that type are real `29xxx` / `294/xxx` spherical roller thrust bearings and
are fine). For 47 of the 162 a spherical roller row with exactly
the same bore, OD and width does exist, because the two series share ISO
dimension series 22 and 23. But in every such pair the load ratings differ
(`2228 EC`: `cr` 655, `c0r` 830; `22228 CC/W33`: 743 and 900), and no SKF row
anywhere in the catalogue has both the same size and the same ratings as any
of the 162. They are different bearings, not copies.

**What they are.** Single row cylindrical roller bearings whose `NU` prefix
was lost in extraction. `EC` is SKF's cylindrical roller design suffix, not
a spherical roller one (Q5 reached the same conclusion for `205 EC`), and
size, ratings and speeds are those of the NU series: `206 EC` 30 × 62 × 16,
44 / 36.5; `2228 EC` 140 × 250 × 68, 655 / 830, reference speed 2800,
limiting speed 4800. The "lost a digit" reading in Q17 was wrong.

**Not renamed.** The most likely designation is given per row below, but it
is a best reading, not a checked one: NU, NJ and NUP bearings of one size
carry the same dimensions and ratings, so the data cannot say which prefix
was lost, and the cage suffix after `EC` (P, J, M, ML) is missing too. To
do with the owner's OK, against SKF's catalogue: set `pn` (and `id`), set
`type` to Cylindrical Roller as Q5 did, and replace the thrust `apps` list.
The `type` part of that was done on 2026-10-10 (Q18a, above); the rest waits.

**The rows named in the request (21).**

| row | bore × OD × width | `cr` / `c0r` | spherical roller row of the same size (`cr` / `c0r`) | exact duplicate | most likely real designation | action |
|---|---|---|---|---|---|---|
| `SKF-206_EC` | 30 × 62 × 16 | 44 / 36.5 | none | no | `NU 206 EC` | kept, logged |
| `SKF-2228_EC` | 140 × 250 × 68 | 655 / 830 | `SKF-22228_CC_W33` (743 / 900), `SKF-22228-2CS5` (744 / 900) | no | `NU 2228 EC` | kept, logged |
| `SKF-2230_EC` | 150 × 270 × 73 | 735 / 930 | `NTN-1080` (null / null), `SKF-22230_CC_W33` (898 / 1080), `SKF-22230-2CS5` (899 / 1080) | no | `NU 2230 EC` | kept, logged |
| `SKF-2232_EC` | 160 × 290 × 80 | 930 / 1200 | `SKF-22232_CC_W33` (1043 / 1290), `SKF-22232-2CS5` (1044 / 1290) | no | `NU 2232 EC` | kept, logged |
| `SKF-2234_EC` | 170 × 310 × 86 | 1059.999 / 1340 | `SKF-22234_CC_W33` (1183 / 1460), `SKF-22234-2CS5` (1185 / 1460) | no | `NU 2234 EC` | kept, logged |
| `SKF-2236_EC` | 180 × 320 × 86 | 1099.999 / 1430 | `SKF-22236_CC_W33` (1237 / 1560), `SKF-22236-2CS5` (1239 / 1560) | no | `NU 2236 EC` | kept, logged |
| `SKF-2238_EC` | 190 × 340 × 92 | 1219.999 / 1600 | `SKF-22238_CC_W33` (1342 / 1700), `SKF-22238-2CS5` (1345 / 1700) | no | `NU 2238 EC` | kept, logged |
| `SKF-2240_EC` | 200 × 360 × 98 | 1369.999 / 1800 | `SKF-22240_CC_W33` (1526 / 1930), `SKF-22240-2CS5` (1529 / 1930) | no | `NU 2240 EC` | kept, logged |
| `SKF-2244_EC` | 220 × 400 × 108 | 1570 / 2280 | `SKF-22244_CC_W33` (1835 / 2360), `SKF-22244-2CS5` (1839 / 2360) | no | `NU 2244 EC` | kept, logged |
| `SKF-2256_EC` | 280 × 500 × 130 | 2200 / 3450 | `NTN-22256BK` (310 / 3), `SKF-22256_CC_W33` (2795 / 3750) | no | `NU 2256 EC` | kept, logged |
| `SKF-2264_EC` | 320 × 580 × 150 | 3190 / 5000 | `NTN-22264BK` (100 / 5), `SKF-22264_CC_W33` (3708 / 49000001101.1) | no | `NU 2264 EC` | kept, logged |
| `SKF-2276_EC` | 380 × 680 × 175 | 3960 / 6400 | none | no | `NU 2276 EC` | kept, logged |
| `SKF-2304_EC` | 20 × 52 × 21 | 47.5 / 38 | none | no | `NU 2304 EC` | kept, logged |
| `SKF-2305_EC` | 25 × 62 × 24 | 64 / 55 | none | no | `NU 2305 EC` | kept, logged |
| `SKF-2306_EC` | 30 × 72 × 27 | 83 / 75 | none | no | `NU 2306 EC` | kept, logged |
| `SKF-2307_EC` | 35 × 80 × 31 | 106 / 98 | none | no | `NU 2307 EC` | kept, logged |
| `SKF-2308_EC` | 40 × 90 × 33 | 129 / 120 | `SKF-22308_E` (155 / 137) | no | `NU 2308 EC` | kept, logged |
| `SKF-2309_EC` | 45 × 100 × 36 | 160 / 153 | `SKF-22309_E` (190 / 176) | no | `NU 2309 EC` | kept, logged |
| `SKF-2310_EC` | 50 × 110 × 40 | 186 / 186 | `SKF-22310_E` (228 / 216) | no | `NU 2310 EC` | kept, logged |
| `SKF-2311_EC` | 55 × 120 × 43 | 232 / 232 | `SKF-22311_E` (280 / 280) | no | `NU 2311 EC` | kept, logged |
| `SKF-2312_EC` | 60 × 130 × 46 | 260 / 265 | `SKF-22312_E` (325 / 335) | no | `NU 2312 EC` | kept, logged |

**Other three and four digit `EC` rows, same pattern (82).**

| row | bore × OD × width | `cr` / `c0r` | spherical roller row of the same size (`cr` / `c0r`) | exact duplicate | most likely real designation | action |
|---|---|---|---|---|---|---|
| `SKF-1007_EC` | 35 × 62 × 14 | 35.8 / 38 | none | no | `NU 1007 EC` | kept, logged |
| `SKF-1009_EC` | 45 × 75 × 16 | 44.6 / 52 | none | no | `NU 1009 EC` | kept, logged |
| `SKF-1010_EC` | 50 × 80 × 16 | 46.8 / 56 | none | no | `NU 1010 EC` | kept, logged |
| `SKF-1011_EC` | 55 × 90 × 18 | 57.2 / 69.5 | none | no | `NU 1011 EC` | kept, logged |
| `SKF-1013_EC` | 65 × 100 × 18 | 62.7 / 81.5 | none | no | `NU 1013 EC` | kept, logged |
| `SKF-1014_EC` | 70 × 110 × 20 | 76.5 / 93 | none | no | `NU 1014 EC` | kept, logged |
| `SKF-1016_EC` | 80 × 125 × 22 | 99 / 127 | none | no | `NU 1016 EC` | kept, logged |
| `SKF-202_EC` | 15 × 35 × 11 | 12.5 / 10.2 | none | no | `NU 202 EC` | kept, logged |
| `SKF-204_EC` | 20 × 47 × 14 | 28.5 / 22 | none | no | `NU 204 EC` | kept, logged |
| `SKF-207_EC` | 35 × 72 × 17 | 56 / 48 | none | no | `NU 207 EC` | kept, logged |
| `SKF-208_EC` | 40 × 80 × 18 | 62 / 53 | none | no | `NU 208 EC` | kept, logged |
| `SKF-209_EC` | 45 × 85 × 19 | 69.5 / 64 | none | no | `NU 209 EC` | kept, logged |
| `SKF-210_EC` | 50 × 90 × 20 | 73.5 / 69.5 | none | no | `NU 210 EC` | kept, logged |
| `SKF-211_EC` | 55 × 100 × 21 | 96.5 / 95 | none | no | `NU 211 EC` | kept, logged |
| `SKF-212_EC` | 60 × 110 × 22 | 108 / 102 | none | no | `NU 212 EC` | kept, logged |
| `SKF-213_EC` | 65 × 120 × 23 | 122 / 118 | none | no | `NU 213 EC` | kept, logged |
| `SKF-214_EC` | 70 × 125 × 24 | 137 / 137 | none | no | `NU 214 EC` | kept, logged |
| `SKF-215_EC` | 75 × 130 × 25 | 150 / 156 | none | no | `NU 215 EC` | kept, logged |
| `SKF-216_EC` | 80 × 140 × 26 | 160 / 166 | none | no | `NU 216 EC` | kept, logged |
| `SKF-217_EC` | 85 × 150 × 28 | 190 / 200 | none | no | `NU 217 EC` | kept, logged |
| `SKF-218_EC` | 90 × 160 × 30 | 208 / 220 | none | no | `NU 218 EC` | kept, logged |
| `SKF-219_EC` | 95 × 170 × 32 | 255 / 265 | none | no | `NU 219 EC` | kept, logged |
| `SKF-220_EC` | 100 × 180 × 34 | 285 / 305 | none | no | `NU 220 EC` | kept, logged |
| `SKF-221_EC` | 105 × 190 × 36 | 300 / 315 | none | no | `NU 221 EC` | kept, logged |
| `SKF-222_EC` | 110 × 200 × 38 | 335 / 365 | none | no | `NU 222 EC` | kept, logged |
| `SKF-224_EC` | 120 × 215 × 40 | 390 / 430 | none | no | `NU 224 EC` | kept, logged |
| `SKF-226_EC` | 130 × 230 × 40 | 415 / 455 | none | no | `NU 226 EC` | kept, logged |
| `SKF-228_EC` | 140 × 250 × 42 | 450 / 510 | none | no | `NU 228 EC` | kept, logged |
| `SKF-230_EC` | 150 × 270 × 45 | 510 / 600 | none | no | `NU 230 EC` | kept, logged |
| `SKF-232_EC` | 160 × 290 × 48 | 585 / 680 | none | no | `NU 232 EC` | kept, logged |
| `SKF-234_EC` | 170 × 310 × 52 | 695 / 815 | none | no | `NU 234 EC` | kept, logged |
| `SKF-236_EC` | 180 × 320 × 52 | 720 / 850 | none | no | `NU 236 EC` | kept, logged |
| `SKF-238_EC` | 190 × 340 × 55 | 800 / 965 | none | no | `NU 238 EC` | kept, logged |
| `SKF-240_EC` | 200 × 360 × 58 | 880 / 1060 | none | no | `NU 240 EC` | kept, logged |
| `SKF-244_EC` | 220 × 400 × 65 | 1059.999 / 1290 | none | no | `NU 244 EC` | kept, logged |
| `SKF-203_EC` | 17 × 40 × 12 | 20 / 14.3 | none | no | `NU 203 EC` | kept, logged |
| `SKF-303_EC` | 17 × 47 × 14 | 28.5 / 20.4 | none | no | `NU 303 EC` | kept, logged |
| `SKF-305_EC` | 25 × 62 × 17 | 46.5 / 36.5 | none | no | `NU 305 EC` | kept, logged |
| `SKF-306_EC` | 30 × 72 × 19 | 58.5 / 48 | none | no | `NU 306 EC` | kept, logged |
| `SKF-307_EC` | 35 × 80 × 21 | 75 / 63 | none | no | `NU 307 EC` | kept, logged |
| `SKF-308_EC` | 40 × 90 × 23 | 93 / 78 | `NTN-21308CK` (88 / 90) | no | `NU 308 EC` | kept, logged |
| `SKF-309_EC` | 45 × 100 × 25 | 112 / 100 | `NTN-21309CK` (1 / 1.04) | no | `NU 309 EC` | kept, logged |
| `SKF-310_EC` | 50 × 110 × 27 | 127 / 112 | none | no | `NU 310 EC` | kept, logged |
| `SKF-311_EC` | 55 × 120 × 29 | 156 / 143 | none | no | `NU 311 EC` | kept, logged |
| `SKF-312_EC` | 60 × 130 × 31 | 173 / 160 | none | no | `NU 312 EC` | kept, logged |
| `SKF-313_EC` | 65 × 140 × 33 | 212 / 196 | none | no | `NU 313 EC` | kept, logged |
| `SKF-314_EC` | 70 × 150 × 35 | 236 / 228 | none | no | `NU 314 EC` | kept, logged |
| `SKF-315_EC` | 75 × 160 × 37 | 280 / 265 | none | no | `NU 315 EC` | kept, logged |
| `SKF-316_EC` | 80 × 170 × 39 | 300 / 290 | none | no | `NU 316 EC` | kept, logged |
| `SKF-317_EC` | 85 × 180 × 41 | 340 / 335 | none | no | `NU 317 EC` | kept, logged |
| `SKF-318_EC` | 90 × 190 × 43 | 365 / 360 | none | no | `NU 318 EC` | kept, logged |
| `SKF-319_EC` | 95 × 200 × 45 | 390 / 390 | none | no | `NU 319 EC` | kept, logged |
| `SKF-320_EC` | 100 × 215 × 47 | 450 / 440 | none | no | `NU 320 EC` | kept, logged |
| `SKF-321_EC` | 105 × 225 × 49 | 500 / 500 | none | no | `NU 321 EC` | kept, logged |
| `SKF-322_EC` | 110 × 240 × 50 | 530 / 540 | none | no | `NU 322 EC` | kept, logged |
| `SKF-324_EC` | 120 × 260 × 55 | 610 / 620 | none | no | `NU 324 EC` | kept, logged |
| `SKF-326_EC` | 130 × 280 × 58 | 720 / 750 | none | no | `NU 326 EC` | kept, logged |
| `SKF-328_EC` | 140 × 300 × 62 | 780 / 830 | none | no | `NU 328 EC` | kept, logged |
| `SKF-330_EC` | 150 × 320 × 65 | 900 / 965 | none | no | `NU 330 EC` | kept, logged |
| `SKF-332_EC` | 160 × 340 × 68 | 1000 / 1080 | none | no | `NU 332 EC` | kept, logged |
| `SKF-334_EC` | 170 × 360 × 72 | 952 / 1180 | none | no | `NU 334 EC` | kept, logged |
| `SKF-336_EC` | 180 × 380 × 75 | 1020 / 1290 | none | no | `NU 336 EC` | kept, logged |
| `SKF-338_EC` | 190 × 400 × 78 | 1140 / 1500 | none | no | `NU 338 EC` | kept, logged |
| `SKF-340_EC` | 200 × 420 × 80 | 1230 / 1630 | none | no | `NU 340 EC` | kept, logged |
| `SKF-352_EC` | 260 × 540 × 102 | 1940 / 2700 | none | no | `NU 352 EC` | kept, logged |
| `SKF-360_EC` | 300 × 620 × 109 | 2330 / 3350 | none | no | `NU 360 EC` | kept, logged |
| `SKF-304_EC` | 20 × 52 × 15 | 35.5 / 26 | none | no | `NU 304 EC` | kept, logged |
| `SKF-1964_EC` | 320 × 440 × 56 | 693 / 1200 | none | no | `NU 1964 EC` | kept, logged |
| `SKF-1972_EC` | 360 × 480 × 56 | 781 / 1460 | none | no | `NU 1972 EC` | kept, logged |
| `SKF-2060_EC` | 300 × 460 × 95 | 1510 / 2600 | none | no | `NU 2060 EC` | kept, logged |
| `SKF-2088_EC` | 440 × 650 × 122 | 2550 / 4900 | none | no | `NU 2088 EC` | kept, logged |
| `SKF-2096_EC` | 480 × 700 × 128 | 2860 / 5600 | none | no | `NU 2096 EC` | kept, logged |
| `SKF-3076_EC` | 380 × 560 × 135 | 2380 / 4750 | none | no | `NU 3076 EC` | kept, logged |
| `SKF-3168_EC` | 340 × 580 × 190 | 3470 / 5850 | `NTN-23168BK` (600 / 6), `SKF-23168-2CS5` (4452 / 6800) | no | `NU 3168 EC` | kept, logged |
| `SKF-3172_EC` | 360 × 600 × 192 | 3410 / 6100 | `NTN-23172BK` (750 / 7), `SKF-23172-2CS5` (4521 / 6950) | no | `NU 3172 EC` | kept, logged |
| `SKF-3184_EC` | 420 × 700 × 224 | 4950 / 9000 | `NTN-23184BK` (200 / 9), `SKF-23184_CJ_W33` (5919 / 9300), `SKF-23184-2CS5` (5919 / 9300) | no | `NU 3184 EC` | kept, logged |
| `SKF-3188_EC` | 440 × 720 × 226 | 5120 / 10000 | `NTN-23188BK` (200 / 10), `SKF-23188_CA_W33` (6215 / 10000), `SKF-23188-2CS5` (6220 / 10000) | no | `NU 3188 EC` | kept, logged |
| `SKF-3192_EC` | 460 × 760 × 240 | 5280 / 9650 | `SKF-23192_CA_W33` (6760 / 10800), `SKF-23192-2CS5` (6765 / 10800) | no | `NU 3192 EC` | kept, logged |
| `SKF-3196_EC` | 480 × 790 × 248 | 5940 / 10800 | `SKF-23196_CA_W33` (7362 / 12000), `SKF-23196-2CS5` (7367 / 12000) | no | `NU 3196 EC` | kept, logged |
| `SKF-3984_EC` | 420 × 560 × 106 | 1680 / 3650 | `NTN-23984K` (630 / 3), `SKF-23984_CC_W33` (2083 / 4150) | no | `NU 3984 EC` | kept, logged |
| `SKF-3992_EC` | 460 × 620 × 118 | 2050 / 4550 | `NTN-23992K` (100 / 4), `SKF-23992_CA_W33` (2558 / 5000) | no | `NU 3992 EC` | kept, logged |
| `SKF-1968_EC` | 340 × 460 × 56 | 682 / 1200 | none | no | `NU 1968 EC` | kept, logged |

**Large sizes written `NN / NNN EC` (12).**

| row | bore × OD × width | `cr` / `c0r` | spherical roller row of the same size (`cr` / `c0r`) | exact duplicate | most likely real designation | action |
|---|---|---|---|---|---|---|
| `SKF-22___560_EC` | 560 × 1030 × 272 | 9900 / 16600 | none | no | `NU 22/560 EC` | kept, logged |
| `SKF-20___500_EC` | 500 × 720 × 128 | 2920 / 5850 | none | no | `NU 20/500 EC` | kept, logged |
| `SKF-20___530_EC` | 530 × 780 × 145 | 3740 / 7350 | none | no | `NU 20/530 EC` | kept, logged |
| `SKF-20___560_EC` | 560 × 820 × 150 | 3800 / 7650 | none | no | `NU 20/560 EC` | kept, logged |
| `SKF-20___600_EC` | 600 × 870 × 155 | 4180 / 8000 | none | no | `NU 20/600 EC` | kept, logged |
| `SKF-20___630_EC` | 630 × 920 × 170 | 4730 / 9500 | none | no | `NU 20/630 EC` | kept, logged |
| `SKF-20___670_EC` | 670 × 980 × 180 | 5390 / 11000 | none | no | `NU 20/670 EC` | kept, logged |
| `SKF-20___710_EC` | 710 × 1030 × 185 | 5940 / 12000 | none | no | `NU 20/710 EC` | kept, logged |
| `SKF-20___750_EC` | 750 × 1090 × 195 | 7040 / 14600 | none | no | `NU 20/750 EC` | kept, logged |
| `SKF-20___800_EC` | 800 × 1150 × 200 | 7040 / 14600 | none | no | `NU 20/800 EC` | kept, logged |
| `SKF-20___850_EC` | 850 × 1220 × 212 | 8420 / 18600 | none | no | `NU 20/850 EC` | kept, logged |
| `SKF-30___500_EC` | 500 × 720 × 167 | 3800 / 7350 | none | no | `NU 30/500 EC` | kept, logged |

**Bare numbers, no prefix and no suffix (22).**

| row | bore × OD × width | `cr` / `c0r` | spherical roller row of the same size (`cr` / `c0r`) | exact duplicate | most likely real designation | action |
|---|---|---|---|---|---|---|
| `SKF-1005` | 25 × 47 × 12 | 14.2 / 13.2 | none | no | `NU 1005` | kept, logged |
| `SKF-1008` | 40 × 68 × 15 | 25.1 / 26 | none | no | `NU 1008` | kept, logged |
| `SKF-1012` | 60 × 95 × 18 | 37.4 / 44 | none | no | `NU 1012` | kept, logged |
| `SKF-1013` | 65 × 100 × 18 | 38 / 46.5 | none | no | `NU 1013` | kept, logged |
| `SKF-1014` | 70 × 110 × 20 | 56.1 / 67 | none | no | `NU 1014` | kept, logged |
| `SKF-1015` | 75 × 115 × 20 | 58.3 / 71 | none | no | `NU 1015` | kept, logged |
| `SKF-1016` | 80 × 125 × 22 | 64.4 / 78 | none | no | `NU 1016` | kept, logged |
| `SKF-1017` | 85 × 130 × 22 | 68.2 / 86.5 | none | no | `NU 1017` | kept, logged |
| `SKF-1018` | 90 × 140 × 24 | 80.9 / 104 | none | no | `NU 1018` | kept, logged |
| `SKF-1019` | 95 × 145 × 24 | 84.2 / 110 | none | no | `NU 1019` | kept, logged |
| `SKF-1020` | 100 × 150 × 24 | 85.8 / 114 | none | no | `NU 1020` | kept, logged |
| `SKF-1021` | 105 × 160 × 26 | 101 / 137 | none | no | `NU 1021` | kept, logged |
| `SKF-1022` | 110 × 170 × 28 | 128 / 166 | none | no | `NU 1022` | kept, logged |
| `SKF-1024` | 120 × 180 × 28 | 134 / 183 | none | no | `NU 1024` | kept, logged |
| `SKF-1026` | 130 × 200 × 33 | 165 / 224 | none | no | `NU 1026` | kept, logged |
| `SKF-1036` | 180 × 280 × 46 | 336 / 475 | none | no | `NU 1036` | kept, logged |
| `SKF-1040` | 200 × 310 × 51 | 380 / 570 | none | no | `NU 1040` | kept, logged |
| `SKF-344` | 220 × 460 × 88 | 1210 / 1630 | none | no | `NU 344` | kept, logged |
| `SKF-348` | 240 × 500 × 95 | 1450 / 2000 | none | no | `NU 348` | kept, logged |
| `SKF-1988` | 440 × 600 × 74 | 1060 / 2000 | none | no | `NU 1988` | kept, logged |
| `SKF-1996` | 480 × 650 × 78 | 1170 / 2240 | none | no | `NU 1996` | kept, logged |
| `SKF-3068` | 340 × 520 × 133 | 2200 / 4150 | `NTN-23068BK` (310 / 4) | no | `NU 3068` | kept, logged |

**`NJG ... VH` full complement cylindrical roller rows (25).**

| row | bore × OD × width | `cr` / `c0r` | spherical roller row of the same size (`cr` / `c0r`) | exact duplicate | most likely real designation | action |
|---|---|---|---|---|---|---|
| `SKF-NJG_2306_VH` | 30 × 72 × 27 | 84.2 / 86.5 | none | no | `NJG 2306 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2307_VH` | 35 × 80 × 31 | 108 / 114 | none | no | `NJG 2307 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2308_VH` | 40 × 90 × 33 | 145 / 156 | `SKF-22308_E` (155 / 137) | no | `NJG 2308 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2309_VH` | 45 × 100 × 36 | 172 / 196 | `SKF-22309_E` (190 / 176) | no | `NJG 2309 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2311_VH` | 55 × 120 × 43 | 233 / 260 | `SKF-22311_E` (280 / 280) | no | `NJG 2311 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2313_VH` | 65 × 140 × 48 | 303 / 360 | `SKF-22313_E` (357 / 360) | no | `NJG 2313 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2314_VH` | 70 × 150 × 51 | 336 / 400 | `SKF-22314_E` (413 / 430) | no | `NJG 2314 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2315_VH` | 75 × 160 × 55 | 396 / 480 | `SKF-22315_E` (462 / 475) | no | `NJG 2315 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2316_VH` | 80 × 170 × 58 | 457 / 570 | `SKF-22316_E` (516 / 530) | no | `NJG 2316 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2317_VH` | 85 × 180 × 60 | 484 / 620 | `SKF-22317_E` (577 / 620) | no | `NJG 2317 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2318_VH` | 90 × 190 × 64 | 550 / 680 | `SKF-22318_E` (637 / 695) | no | `NJG 2318 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2320_VH` | 100 × 215 × 73 | 704 / 900 | `SKF-22320_E` (847 / 950) | no | `NJG 2320 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2322_VH` | 110 × 240 × 80 | 858 / 1060 | `SKF-22322_E` (989 / 1120) | no | `NJG 2322 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2324_VH` | 120 × 260 × 86 | 952 / 1250 | `SKF-22324_CC_W33` (1019 / 1120), `SKF-22324-2CS5` (1022 / 1120) | no | `NJG 2324 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2326_VH` | 130 × 280 × 93 | 1080 / 1430 | `SKF-22326_CC_W33` (1176 / 1320), `SKF-22326-2CS5` (1178 / 1320) | no | `NJG 2326 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2328_VH` | 140 × 300 × 102 | 1230 / 1660 | `SKF-22328_CC_W33` (1357 / 1560), `SKF-22328-2CS5` (1359 / 1560) | no | `NJG 2328 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2330_VH` | 150 × 320 × 108 | 1450 / 1930 | `SKF-22330_CC_W33` (1539 / 1760), `SKF-22330-2CS5` (1541 / 1760) | no | `NJG 2330 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2334_VH` | 170 × 360 × 120 | 1760 / 2450 | `SKF-22334_CC_W33` (1863 / 2160) | no | `NJG 2334 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2336_VH` | 180 × 380 × 126 | 1870 / 2650 | none | no | `NJG 2336 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2338_VH` | 190 × 400 × 132 | 2160 / 3000 | `SKF-22338_CC_W33` (2232 / 2650), `SKF-22338-2CS5` (2236 / 2650) | no | `NJG 2338 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2340_VH` | 200 × 420 × 138 | 2290 / 3200 | `SKF-22340_CC_W33` (2439 / 2900) | no | `NJG 2340 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2344_VH` | 220 × 460 × 145 | 2700 / 3750 | `SKF-22344_CC_W33` (2839 / 3450), `SKF-22344-2CS5` (2844 / 3450) | no | `NJG 2344 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2348_VH` | 240 × 500 × 155 | 3140 / 4400 | `SKF-22348_CC_W33` (3229 / 4000) | no | `NJG 2348 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2352_VH` | 260 × 540 × 165 | 3580 / 5000 | `NTN-22352BK` (100 / 4), `SKF-22352_CC_W33` (3680 / 4550) | no | `NJG 2352 VH` (designation is right, only `type` is wrong) | kept, logged |
| `SKF-NJG_2305_VH` | 25 × 62 × 24 | 68.2 / 68 | none | no | `NJG 2305 VH` (designation is right, only `type` is wrong) | kept, logged |

**Seen while checking, not changed.**

- `SKF-22264_CC_W33` has `c0r` 49000001101.1 (should be near 4900).
- `NTN-22256BK` (`cr` 310, `c0r` 3), `NTN-22264BK` (`cr` 100, `c0r` 5) and
  `NTN-1080` (150 × 270 × 73, typed Spherical Roller, no ratings) look wrong.
- The reverse mistake exists as well: 16 SKF rows typed Cylindrical Roller
  carry spherical roller designations (`21305 CC`, `21308 E` ...).

Record counts are unchanged by Q18 and Q18a to Q18e: 3,672 raw rows,
3,654 searchable.
