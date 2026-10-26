# Guided flow: one project, six steps

Status (2026-10-25): direction approved by Bryan from a clickable mockup of the screens below ("looks good"). Not
built. Bryan ruled on the open calls at the end the same day ("all as recommended"); a plan comes before any code.

## Why

Bryan, 2026-10-24: "i don't like the UI of this app at all. It's not similar to the flow of RISC-5 at all."

The app today is a set of calculators under a step bar. Each fate model is its own screen with its own chemical picker
and Run button, and a result reaches risk or cleanup only when it is sent by hand. Five chemicals mean five runs on each
screen and a send button per result (`docs/USABILITY.md` row M10). The site model screen is advisory: it locks and
drives nothing. Wave H defined parity as "parity of workflow, not of screens" (`docs/UI_PARITY.md` section 1); this
direction replaces that definition: the app follows the RISC5 manual's six-step order, where each step reads the one
before and the site model decides which models run.

## The flow

One project and one path. A step list on the left (it stacks above the content on a phone) shows each step as done,
current or to do; every screen has Back and Next. There are no send buttons: each step reads the steps before it.

1. **Chemicals of concern.** A database list (search by name or CAS) beside the project's list, with Add and Remove
   between them; up to 50 chemicals. Links to edit values for this project, define a chemical and download the
   chemical summary table. Every later step works on all project chemicals at once.
2. **Site model.** Who is exposed (people or ecological screening); whether concentrations at the receptor are modeled
   from the source or measured there; where the contamination is (soil above the water table, groundwater, soil gas,
   soil below the water table); where people are exposed (on the site, or downgradient at a distance); the paths to
   model (soil leaching to groundwater, groundwater to a well, vapor into a building, groundwater to a stream); the
   indoor air model. A side panel shows the chain of models the answers imply. Changing an answer marks the later steps
   to run again.
3. **Concentrations.**
   - 3a **Site properties:** only the groups the chosen models need (source area, unsaturated zone with a soil type that
     fills its values, aquifer, building). Each value says where it came from (from the soil type, a default with no
     source, entered with no source), and a value a chosen model needs but nobody entered is marked as needed.
   - 3b **Source concentrations:** one row per chemical, one column per source medium from step 2, with a unit choice
     (for example ug/L or mg/L for groundwater), a sample note per row, pasting from a spreadsheet, and the optional
     total petroleum hydrocarbons in soil.
   - 3c **Chemical values:** the properties the chosen models use, from the database, with project-only edits.
   - 3d **Run and view:** simulation time, time step and the method basis (modern with legacy as a check, or the
     reverse), then one Run for every chemical through every chosen model. Results: concentration over time at the
     well per chemical, indoor air, the model input summary and per-chemical detail, with a CSV of every chemical and
     time step.
4. **Exposure.**
   - 4a **Pathways:** start ticked from the site model; pathways the site model rules out are shown disabled with the
     reason.
   - 4b **Receptors:** one or two, each with a name and a profile (EPA RSL defaults), edited factors highlighted with
     the preset value and a note, and the option to add child and adult for cancer risk.
   - 4c **Toxicity values:** only those the ticked pathways need; the inhalation basis choice (unit risk and reference
     concentration, or slope factor and reference dose).
5. **Risk or cleanup levels.** Forward risk from the measured concentrations, or cleanup levels at the source; targets
   per chemical or for all chemicals together (keeping their measured ratios); a target cancer risk and hazard quotient
   per chemical, or a water standard at the well instead (a federal MCL, or a state standard entered with its source).
   Solving re-runs the step 3 models for each chemical until its targets are met.
6. **Results.** Tables of cleanup levels (with the limiting endpoint and pathway, the cancer-based and hazard-based
   levels, the legacy sensitivity, "not quantified" with its reason, and the above-solubility flag), cancer risk,
   hazard index and the inputs and outputs summary; Download CSV; print the report or save a PDF.

## Constraints

- Clean room: the step order and choices come from the manual's description of its workflow
  (`docs/RISC5_UI_INVENTORY.md`, sections B, D to I). No RISC5 screen, figure or prose is reproduced.
- The engine is unchanged; this is a change of screens, state and orchestration.
- Everything wave AA made the report do stays: one block per chemical with the inputs its run used, honest sources,
  "not quantified", the method basis.
- Web rules: no UI framework, mobile and desktop, light and dark, zero overflow at a true 390x844 viewport.
- Projects saved by the current app keep opening.

## Open calls (ruled by Bryan, 2026-10-25)

Each had a recommendation (2026-10-25). Bryan, 2026-10-25: "all as recommended". Each call below is settled as its
recommendation says.

1. **Several source media at once.** Step 2 allows soil and groundwater together; RISC5 takes one source medium per
   analysis. Recommended: allow it. Real sites have both, and the single-medium rule is what refused groundwater plus
   vapor in the walkthrough (`docs/USABILITY.md` row M7).
2. **Navigation.** Any step can be opened from the list, and an earlier change marks later steps to re-run; RISC5
   unlocks a step only after the one before it. Recommended: free navigation with re-run marks. The stale marks
   already exist, and a reviewer checking a project needs to jump to any step.
3. **One method choice.** Legacy or modern chosen once in 3d with the other kept as a check, not on each screen.
   Recommended: yes; it matches the report's method basis from wave AA.
4. **The separate model screens.** Recommended: build the six steps from their forms and engine calls, take them out
   of the main navigation, and keep one "Model workbench" link outside the steps for single-model checks and the
   published-example reproductions. Their tests and the validation evidence keep working; retire them later if
   nobody uses the workbench.
5. **3c as its own screen.** Recommended: a summary on 3b with an edit panel, as in the mockup; chemical values
   rarely change per project.
6. **Order against wave AB** (plain language in labels and units). Recommended: the guided flow first, with AB's label
   and unit fixes made in each screen as it is rebuilt; relabelling screens that are about to be replaced is wasted
   work.
