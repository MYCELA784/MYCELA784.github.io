# `apps` vs `type` audit

Follow-up to Q5 (`docs/data-quarantine.md`). The Q5 fix corrected
`SKF-205_EC.type` to `Cylindrical Roller` but left its `apps` array
(`vertical shaft applications`, `extruders`, `mixers`, `heavy axial
loads`) untouched — thrust-bearing applications on a bearing that carries
no thrust. This audit asks how widespread that class of mismatch is.

Run: `node scripts/audit-apps-vs-type.js` (read-only, writes nothing).

## Method

Load-direction only. A bearing type has a load-carrying capability; some
application tags imply a load direction. A tag that needs a direction the
type cannot provide is a contradiction. Direction-ambiguous tags (`pumps`,
`gearboxes`, `fans`, `conveyors`, `automotive`, `mining`, `cement`, `paper
mills`, `electric motors`, `machine tools`, …) are **not** judged — they
appear on every type and flagging them would be guesswork.

| bucket | tags | wrong on types |
|---|---|---|
| axial tags | `heavy axial loads`, `axial loads`, `screw drives`, `vertical shaft applications`, `vertical shafts` | Cylindrical Roller, Needle Roller, Self-Aligning Ball, Spherical Roller |
| radial tags | `high radial loads`, `vibrating screens`, `crushers`, `traction motors`, `axles`, `wheel hubs`, `differentials` | Thrust Ball, Spherical Roller Thrust |

## Result — 80 hard contradictions / 3,688 records

Grouped by type:

| type | count | offending tag set | examples |
|---|---|---|---|
| Cylindrical Roller | 1 | `heavy axial loads` + `vertical shaft applications` | `SKF-205_EC` (205 EC) — the Q5 row |
| Self-Aligning Ball | 6 | `heavy axial loads` + `vertical shaft applications` | `SKF-2248`, `SKF-2252`, `SKF-2260` — full apps `[vertical shaft applications, extruders, mixers, heavy axial loads]` |
| Thrust Ball | 73 | `vibrating screens` (68), `axles` + `wheel hubs` (4), `crushers` + `vibrating screens` (1) | `NTN-51200`, `NTN-51101`, `NTN-8200`, `FAG-8237_5167_5` |

Spherical Roller Thrust: **0** — all 225 records carry axial-flavoured
apps, correctly.

## Wider picture (reported by the script, not counted above)

- **Thrust Ball is systemically mis-tagged.** 201 of 231 Thrust Ball
  records have **no** axial-implying tag at all; 128 of those carry
  radial-industry canned sets (`agricultural machinery`, `fans`,
  `conveyors`, `mining`, `paper mills`, `textile`). Only ~30 Thrust Ball
  records (the `axial loads / machine tools / screw drives / vertical
  shafts` set) look right. This is a canned-app-set assignment error for
  the whole type, not 73 isolated rows.
- The 7 axial-tags-on-radial rows (Cylindrical Roller + Self-Aligning
  Ball) all carry the identical canned set
  `[vertical shaft applications, extruders, mixers, heavy axial loads]` —
  the same set that legitimately sits on Spherical Roller Thrust. Looks
  like the set leaked onto a handful of neighbouring rows during
  extraction.

## Side observation

11 duplicate `id`s in the loaded DB (`NTN-12000`, `NTN-8200`, `NTN-8100`,
`NTN-7600`, `NTN-8400`, `NTN-7400`, `NTN-6400`, `NTN-6000`, `NTN-5000`,
`NTN-5800`, `FAG-1154`) — two rows each. Unrelated to this audit; noted
for a future data pass.

## Not fixed

Nothing changed. A fix would be a canned-app-set correction (biggest win:
re-derive Thrust Ball apps) plus a per-row pass on the 7 leaked rows.
