# Chemical and toxicity database (data plan for M4)

The plan for `chemicals.json` and `tox.json`, the database that replaces RISC5's hand-maintained
128-chemical table (ROADMAP section 3, row "Ch. 10"). RISC5's database is not copied or consulted for
values; its chapter 10 was read only to see which properties RISC5 carries. Status: DONE 2026-10-16 (M4). The plan was
written in M4 stage 1; the build landed in slice D1 (`packages/data/src/rsl`, output in `packages/data/generated/rsl-2024-11/`); the
web screen reads it through `apps/web/src/risk/chemicalDb.ts` (slice W1). The choices below are DEFAULT rulings recorded in
`docs/DECISIONS.md` (2026-10-16, M4 block).

## Which edition is current

Checked 2026-10-16 on the EPA site. The Generic Tables page
(https://www.epa.gov/risk/regional-screening-levels-rsls-generic-tables, page last updated March 13,
2026) fills its download links from EPA's SEMS document collection 36504, and every document in that
collection is dated 11/13/2024 and titled "November 2024". The What's New page lists November 13, 2024
as the latest update (the one before it is May 14, 2024). No 2025 or 2026 edition exists. **The current
edition is the RSL November 2024 release**, and `epa2024rsl` records it.

## Which tables feed the database

All from the November 2024 release, target risk 1e-6 and THQ 1 versions, Excel format, fetched from
`https://semspub.epa.gov/src/document/HQ/<id>`:

| File (SEMS id) | Size (bytes) | SHA-256 | Feeds |
|---|---|---|---|
| Summary RSL November 2024 HQ10 XLS (405270) | 183,268 | `0160dc81b4f55d738a354a74de92488f149946ebfa7c6a6c64592f45348043d7` | `tox.json`: SFO, IUR, RfDo, RfCi with their source keys; volatile and mutagen flags; GIABS, ABSd, Csat |
| Chemical Specific Parameters November 2024 XLS (405302) | 257,844 | `10a5b89421a9d66ee811a12beb08032e0c6371a714cec5ceb2800fd8b57f2017` | `chemicals.json`: MW, H', HLC, VP, MP, density, Dia, Diw, Kd, Koc, log Kow, S, each with its reference column; B, tau_event, t*, Kp with the Kp reference |
| Resident Tap Water RSL November 2024 HQ10 XLS (405290) | 162,375 | `46d533bc73579516012a4713d93bc64d5daa0d704d8dffa69f3a9cde3abdcc10` | `chemicals.json`: FA and the RAGS E prediction-domain flag ("In EPD?"), which only this table carries |

Read for fixtures only (values hand-entered into `packages/engine/test/fixtures/exposure/`, not built
into the database): Resident Soil (405274, SHA-256 `72c34ac76cfa77fc2cfa741ec89dda518b4c374ddd1507bdbbe2854d84bda1ac`),
Composite Worker Soil (405278, `892e940134f4e48d0a4c983d18479024583e24f6edc147c382c630de4c5aed38`),
Resident Air (405282, `1f6e7c509ba37181d938512c64c23c5ac378a2ab62b9ead3d2e1ffcc0a331fba`), and
the Default Exposure Parameters and Definitions XLS (404323,
`335ada8ebec39d98a6da421c33159c6d0de7a612852fc66b0219025a575bfba7`), which a test compares against the
engine's modern presets. Checksums were taken on 2026-10-16 from the bytes served then.

Not used: the subchronic toxicity table (chronic values only in M4), the composite table, the soil to
groundwater table (M5), and the THQ 0.1 versions.

## Committed or fetched (DEFAULT ruling 9)

The three build inputs are committed under `packages/data/raw/rsl/2024-11/` (about 600 kB, public
domain) with a `manifest.json` listing each file's SEMS id, title, retrieval date, size and SHA-256.
The build reads only the committed files and fails if a checksum differs, so the gate and CI never touch
the network. A separate `fetch-rsl` script downloads a named edition by SEMS ids, verifies or records
the checksums, and is run by hand when EPA publishes a new edition (semiannual); a new edition is a new
directory and a reviewed diff of the generated JSON, never an in-place overwrite.

## Toxicity hierarchy and source tags

The RSL tables already apply the Superfund toxicity hierarchy (`epa2003toxhier`: tier 1 IRIS, tier 2
PPRTV, tier 3 other peer-reviewed sources, which the memorandum does not rank). The RSL user's guide
(`epa2024rslug`, section 2.3) ranks the tier 3 sources it uses, in the order it presents them: ATSDR
(final before draft), EPA Office of Water, Cal EPA OEHHA, PPRTV appendix screening values, then HEAST;
its section 5 records chemical-specific departures from that order (for example uranium, and the 2021
memo on chronic and subchronic values cited in the November 2024 update). The build does not re-derive
the hierarchy; it carries the RSL's chosen value and the RSL's one-letter key for it, mapped to a named
source:

| Key | Source |
|---|---|
| I | IRIS |
| P | PPRTV |
| O | EPA Office of Pesticide Programs |
| A | ATSDR (final) |
| T | ATSDR (draft) |
| C | Cal EPA OEHHA |
| X | PPRTV screening value |
| H | HEAST |
| D | EPA Office of Water |
| R | EPA Office of Research and Development |
| N | State of Wisconsin |
| W | toxicity equivalence factor applied |
| E | relative potency factor applied |
| G | see the RSL user's guide |

Physical and chemical values carry the RSL's reference column verbatim (for example PHYSPROP, EPI,
CRC, WATER9, RAGSE). A value the RSL leaves blank stays absent: the build never fills a gap, and the
screen lets the user enter a project value, tagged `user`. CompTox is not used in M4 (DEFAULT ruling
10); the `epacomptox` entry stays a data source for a later gap-filling pass.

## Output schema

Both files are generated into `packages/data/generated/rsl-2024-11/`, committed, exported from
`@model-flow/data`, and checked for drift by a `data:check` step added to the gate (regenerate, then
`git diff --quiet`). Values are stored in the RSL's published units, named in a `units` block, because
the database is a boundary artefact; the engine converts to SI on the way in (DEFAULT ruling 11).

```
chemicals.json
{
  "edition": "2024-11",
  "source": { "reference": "epa2024rsl", "documents": [405302, 405290], "retrieved": "2026-10-16" },
  "units": { "mw": "g/mol", "hPrime": "1", "hlc": "atm-m3/mol", "vp": "mmHg", "mp": "C",
             "density": "g/cm3", "dia": "cm2/s", "diw": "cm2/s", "kd": "L/kg", "koc": "L/kg",
             "logKow": "1", "s": "mg/L", "kp": "cm/h", "b": "1", "tauEvent": "h", "tStar": "h" },
  "chemicals": [
    { "id": "71-43-2", "cas": "71-43-2", "name": "Benzene",
      "values": { "mw": { "value": 78.115, "ref": "PHYSPROP" }, "koc": { "value": ..., "ref": "..." }, ... },
      "fa": 1, "inEpd": true }
  ]
}

tox.json
{
  "edition": "2024-11",
  "source": { "reference": "epa2024rsl", "documents": [405270], "retrieved": "2026-10-16" },
  "units": { "sfo": "(mg/kg-d)-1", "iur": "(ug/m3)-1", "rfdo": "mg/kg-d", "rfci": "mg/m3", "csat": "mg/kg",
             "mcl": "ug/L", "publishedSsl": "mg/kg" },
  "sourceKeys": { "I": "IRIS", "P": "PPRTV", ... },
  "toxicity": [
    { "id": "71-43-2", "cas": "71-43-2", "name": "Benzene",
      "sfo": { "value": 0.055, "source": "I" }, "iur": { "value": 7.8e-6, "source": "I" },
      "rfdo": { "value": 0.004, "source": "I" }, "rfci": { "value": 0.03, "source": "I" },
      "volatile": true, "mutagen": false, "giabs": 1, "absd": null, "csat": 1820,
      "mcl": 5, "publishedSsl": { "risk": { "value": 0.00023, "key": "c*" }, "mcl": 0.0026 } }
  ]
}
```

`mcl` is the summary table's MCL cell (ug/L; a "(G)" cell keeps its number and sets `mclGroup: true`, a
bare "(G)" sets the flag alone). `publishedSsl` holds the table's soil-to-groundwater SSLs at DAF 1 (risk
based with its c / c* / c** / n key, MCL based) as comparison values only. A third derived file,
`cleanup-chemicals.json`, is the subset with Koc, Kd (with its reference), H', S, MW and log Kow for the cleanup
screen and the plants and ecology screen (log Kow, M9 slice W1), generated by the same build and checked by `data:check`.

`id` is the CAS number, suffixed with a slug of the analyte name where the RSL lists more than one row
under one CAS number (the build asserts uniqueness). 151 of the roughly 890 RSL rows carry a leading `~` on
the analyte name, whose meaning the user's guide does not state; the build keeps the name exactly as
printed in `rslName` and strips the marker from the display `name`. The rows the user's guide gives their own equations
(trichloroethylene and vinyl chloride) carry `special: "<code>"` so the engine can warn.

## Attribution wording (public domain)

`docs/ATTRIBUTIONS.md` lists `epa2024rsl` under data sources, and the in-app database page and every
export that uses a database value carry:

> Chemical, physical and toxicity values are from the U.S. EPA Regional Screening Levels (RSLs),
> Generic Tables, November 2024 edition (summary table, chemical-specific parameters table and resident
> tap water table; SEMS documents 405270, 405302 and 405290, retrieved 2026-10-16). These tables are a
> work of the U.S. federal government and are in the public domain in the United States. Each value
> keeps the source EPA assigned to it (IRIS, PPRTV, ATSDR and others). Their use here does not imply
> endorsement of this software by EPA.

A value the user changed is labelled `user` in every table and export, so a reader can tell the
published value from a project value.

## References and verification (2026-10-16)

| Key | Verified against |
|---|---|
| `epa2024rsl` | EPA Generic Tables page and SEMS collection 36504 (all documents dated 11/13/2024, "November 2024"); the five spreadsheets above downloaded and opened |
| `epa2024rslug` | EPA User's Guide page (sections 2.3 toxicity hierarchy, 4.9 dermal parameters, 5.10 arsenic RBA, 5.17 mutagens, 5.18 trichloroethylene); page last updated March 13, 2026 |
| `epa2003toxhier` | EPA SEMS copy of the memorandum (OSWER Directive 9285.7-53, December 5, 2003) |
