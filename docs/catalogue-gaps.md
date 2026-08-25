# Sealing-field gaps in `bearings_db.js`

Investigation triggered by a search-ranking bug where "6205-2RS" surfaced
unrelated FAG parts instead of the 6205 family — tracing that bug back
showed the underlying `sealing` field is unreliable for two of the three
brands in the catalogue. This documents exactly what's wrong, per brand,
and which part of it is a data bug versus a missing-source-data gap.

Counts below come from `window.MYCELA_DB` in `preview/bearings_db.js`
(3,715 records; root `bearings_db.js` is the same data). `js/db.js` was
checked directly — its `forEach`/`filter` passes only ever read or write
`b.type`, `bore`, `od`, `w`, `cr`, and `pn`. **Nothing in the runtime
loader touches `sealing`**, and no default is ever assigned when it's
missing. Every number below is present verbatim in the source file.

## The three problems

| # | Problem | Bug or sourcing gap? |
|---|---|---|
| 1 | **SKF: `sealing` is a hardcoded constant.** All 2,372 SKF records say `"Open"`, with zero exceptions — including records whose own part number literally encodes a sealed/single-seal suffix (e.g. `23022-2RS`, `NA 4900 RS`). The field was never derived from anything for this brand. | **Bug.** Fixable by re-deriving `sealing` from the pn suffix — no new source data needed for these specific records. |
| 2 | **FAG: 20 records with a `2RZ` suffix are tagged `"Open"`.** FAG's extraction otherwise works — 189 of 209 suffix-bearing FAG pn's are already tagged correctly (`2RSR`→Sealed, `2Z`→Shielded). `2RZ` (low-friction non-contact seal) specifically was missed. | **Bug**, same class as #1, much smaller blast radius. |
| 3 | **NTN: zero `"Sealed"` records anywhere, and zero pn's containing `2RS`/`LLU`/`LLB` in the whole 889-record set.** NTN's `ZZ`→Shielded mapping *does* work correctly (14 records). There's no suffix evidence to derive from because the contact-sealed SKUs were never pulled into this dataset at all. | **Sourcing gap.** Nothing to relabel — the records don't exist. Needs re-extraction from the NTN catalogue. |

## Exact counts per brand

Whole catalogue (3,715 records):

| Brand | Total | Open | Shielded | Sealed |
|---|---|---|---|---|
| SKF | 2,372 | 2,372 (100%) | 0 | 0 |
| NTN | 889 | 875 (98%) | 14 (2%) | 0 |
| FAG | 454 | 265 (58%) | 91 (20%) | 98 (22%) |

62xx family specifically (the family behind the original ranking bug), 160 records:

| Brand | Total | Open | Shielded | Sealed |
|---|---|---|---|---|
| SKF | 44 | 44 | 0 | 0 |
| NTN | 15 | 15 | 0 | 0 |
| FAG | 101 | 42 | 24 | 35 |

Mislabeled records (pn suffix implies a sealing arrangement the `sealing`
field doesn't reflect):

| Brand | Suffix codes already in `constants.js` `SUFFIX_CODES` | Mislabeled (table as-is) | Suffix codes present in data but **missing** from that table | Additional mislabeled once table is extended |
|---|---|---|---|---|
| SKF | `2RS` | 14 | `2RS5` (6 records), bare `RS` (6 records) | +12 |
| FAG | `2RZ` | 20 | — | — |
| NTN | — | 0 | — | — |
| **Total** | | **34** | | **+12 → 46** |

## Suffix → sealing mapping to derive from

This reuses `preview/js/constants.js`'s existing `SUFFIX_CODES` table (the
same one `renderer.js`'s modal suffix-decoder already uses), read for its
sealing implication rather than its display text:

| Suffix | Sealing | Source |
|---|---|---|
| `2RS`, `2RS1`, `2RS2`, `2RSR`, `2RSH`, `2RSL` | `Sealed` | already in `SUFFIX_CODES` |
| `2RZ` | `Sealed` (low-friction non-contact seal) | already in `SUFFIX_CODES` |
| `LLU`, `LLB`, `LLH` | `Sealed` (NTN contact-seal codes) | already in `SUFFIX_CODES` |
| `2Z`, `Z`, `ZZ` | `Shielded` | already in `SUFFIX_CODES` |
| `2RS5` | `Sealed` | **not yet in `SUFFIX_CODES`** — found in 6 SKF pn's (`23024-2RS5`, `23120-2RS5`, `24015-2RS5`, `24020-2RS5`, `24022-2RS5`, `24120-2RS5`); add before deriving, or these stay mislabeled |
| bare `RS` (no leading `2`) | `Sealed` (single contact seal) | **not yet in `SUFFIX_CODES`** — found in 6 SKF needle-roller pn's (`NA 4900 RS`, `NA 4906 RS`, `NA 4907 RS`, `RNA 4908 RS`, `RNA 4909 RS`, `RNA 4910 RS`); add before deriving |

Derivation rule: tokenize `pn` the same way `renderer.js`'s
`decodeSuffixes()` already does (`pn.toUpperCase().split(/[-\/\s]+/).slice(1)`),
and if any token is in the Sealed set, set `sealing = "Sealed"`; else if any
token is in the Shielded set, set `sealing = "Shielded"`; otherwise leave
whatever's already there. Precedence matters if a pn somehow carries both
(none currently do) — Sealed should win, since a contact seal implies more
than a shield.

## What this does and doesn't fix

**Deriving `sealing` from the pn suffix only fixes the ~34–46 records above
that are already mislabeled.** It does not add a single new SKU. It's a
pure relabeling pass over existing rows.

**It does not touch the real gap**, which is that SKF (2,372 records, 0
sealed/shielded) and NTN (889 records, 0 sealed) are missing the sealed
and/or shielded *variants themselves* for the overwhelming majority of
their families — not just mislabeled, genuinely absent as rows. The 62xx
table above makes the shape of it obvious: FAG has Open/Shielded/Sealed
variants of the same bearing; SKF and NTN only ever have the one Open row.
Getting real coverage there means going back to the SKF and NTN source
catalogue PDFs and pulling the sealed/shielded SKUs that were never
extracted in the first place — a separate, larger extraction job, not
something a relabeling script can produce from data that isn't there.
