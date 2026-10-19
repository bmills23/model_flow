# User guide

model_flow is an open reimplementation of RISC5-class fate-and-transport and risk methods. Everything runs
in your browser: nothing is uploaded, there are no accounts and no analytics. This guide covers each screen,
saving and sharing a project, the report, and the switch between legacy and modern methods. The reasoning
and sources behind each calculation are in the methods notes listed on the documentation index.

## Getting around

- The links under the title open each screen. The flow runs from the chemicals and site, through transport
  and receptors, to risk, cleanup levels and the report.
- Every screen has a **Help** link under its title. It opens the section of this guide that describes that
  screen, and the browser Back button returns you to the screen.
- The six numbered steps (Chemicals, Site model, Transport, Receptors, Risk & cleanup, Results) are all
  links, and none is locked: open them in any order. The step that owns the screen you are on is
  highlighted; the groundwater, vadose, saturated soil, vapor, surface water, household and plants screens
  count as Transport. Chemicals opens the chemical database and Site model opens the site model screen.
- Screens pass results to each other (for example the groundwater concentration at a well goes to the risk
  screen). A result is only passed when you press the button that sends it, and the receiving screen says
  where its value came from.
- Everything you type is kept in this browser as you work, so a reload brings it back. That copy is a
  convenience only. Save the project to a file to keep it.
- **New project** in the header clears every screen, the values passed between screens and the copy kept in
  this browser.
- The page works on a phone and on a desktop, in light and dark themes (it follows your device setting).

## Legacy and modern methods

Each process offers a legacy method, which is the choice RISC5 makes, and a modern alternative. Where a
screen shows both, they run on the same inputs so you can see the difference. A badge on each method in
Methods and References says which kind it is, and lists its assumptions and sources. Neither is a
recommendation by itself: the methods notes say where a legacy method is kept only for comparison and what
its validity limits are. Warnings on a screen list the checks a method failed for your inputs.

## Projects: save, open and share

- **Project title** names the file and appears on the report.
- **Save project** downloads one JSON file holding every screen as you typed it, including text that does
  not yet parse, and the values you sent between screens. Results are not stored: they are computed again
  from the inputs, and every random analysis repeats from its seed.
- **Open project** loads such a file (choose it, or drop it on the page). A file that is not a project, or
  that was made by a newer version of the app, is refused with a message and nothing is changed. If a file
  has an unknown key it is ignored and listed. If a value passed between screens in the file is unusable
  it is dropped and named, and your inputs still load.
- A value passed between screens records which inputs it was built from. If those inputs have since
  changed, the app tells you the value is out of date and asks you to send it again. It is never refreshed
  silently.
- **Share link** puts the project in the address after the `#`, compressed. A hash is never sent to a
  server, so the link carries the project without anyone hosting it. The link does not include the values
  passed between screens; whoever opens it sends those again from their source screens.
- A link longer than 8000 characters is not offered, because chat and mail programs often cut longer ones.
  Save a file instead. The app shows the limit rather than a shortened link.
- Opening a project, from a file or a link, asks first when the current project has changes not saved to a
  file.
- **Type numbers with a decimal comma** (a checkbox under the project buttons) lets you type and read
  "1,5" for 1.5 in every number box. It is a setting of this browser only. Saved files, share links and CSV
  always use the point. With it on, a box shows a message and keeps your text when it cannot tell what you
  meant: both a comma and a point, more than one comma, or a thousands-style group such as "1.234". Retype
  the number with a single comma. A box that cannot be read blocks the calculation until you fix it, and
  that text is never saved: a saved file or link holds that box as empty. Name and citation boxes are
  plain text and are not affected by this setting.
- Private windows or a full browser store can stop the automatic copy. The app then works as usual and only
  the reload recovery is lost.

## Screens

### Groundwater transport (`#/transport`)

A dissolved plume from a finite source in uniform groundwater flow, with retardation and first-order decay.
Compare the legacy AT123D-class method with the modern exact solution at a receptor and across the site.
Buttons below the result send the well concentration to the risk screen, the aquifer to cleanup levels, the
water table concentration to vapor intrusion and the plume to surface water.

The chemical select fills Kd from the database Koc times the organic carbon fraction you enter; the half-life is not in the database and stays your input. If the database has no Koc for the chemical (hydrogen cyanide and mercury), the retardation settings stay as they are and a note says so.

### Vadose leaching (`#/vadose`)

A source in unsaturated soil loses chemical to the air and to infiltrating water. Follow the leachate to the
water table with the legacy or the modern layered model. The screen shows the source and leaching, the
arrival at the water table, a mass budget, and a validation case you can load. It can feed the groundwater
and vapor screens.

The chemical select fills molar mass, solubility, Henry constant, Koc and both diffusivities from the EPA RSL tables; every value stays editable, and the leachate decay rate stays your input.
Each soil layer (the source and every layer above and below it) has a Texture preset. Choosing one of the twelve classes fills porosity, residual water content, van Genuchten n, saturated conductivity and bulk density with the class averages the vapor screen uses; thickness and organic carbon stay yours. Every filled value can be edited afterwards, and Custom values leaves the numbers as they are.

### Saturated soil source (`#/saturated`)

Chemical in soil at or below the water table dissolves into the groundwater flowing through it. Release it
at a constant rate until it is gone (legacy) or in proportion to the mass left (modern). The release can
feed the groundwater and vapor screens. A worked example is built in.

The chemical select fills molar mass, solubility, Henry constant and Koc from the EPA RSL tables; every value stays editable, and the source decay rate stays your input.
The Texture preset in the Soil group fills porosity, bulk density, residual water content and van Genuchten n from the twelve class averages the vapor screen uses. Organic carbon and the aquifer conductivity stay yours. Every filled value can be edited afterwards, and Custom values leaves the numbers as they are.

### Vapor intrusion (`#/vapor`)

Vapors from soil, soil gas or groundwater diffuse through the soil and enter a building. The legacy and
modern Johnson and Ettinger methods run on one set of inputs, with indoor air results, the vapor profile
through the soil and a check against a published case.

### Surface water and sediment (`#/surface-water`)

A groundwater plume that reaches a river or lake discharges through the bed. Mix it into the water body to
get the surface water concentration, find the sediment concentration by equilibrium partitioning, and
compare the well-mixed box (legacy) with the mass-discharge method (modern). The criteria and exposure
section compares the result with water quality and sediment criteria.

### Shower, irrigation and particulates (`#/household`)

Household exposure from tap and irrigation water and from surface soil: shower air, sprinkler spray and
irrigation contact, and windblown particulates, each with a legacy and a modern method. Values that no
primary source supplied are left blank for you to enter; values taken as RISC5 choices carry a warning. The
result can be sent to the risk and cleanup screens.

### Plants, ecology and TPH (`#/plants-eco`)

Homegrown produce plant factors for the risk screen, screening ecological hazard quotients, and total
petroleum hydrocarbon levels from a fraction composition. Nothing is defaulted from memory: a value without
a primary source is yours to enter, and the button that sends a result on stays disabled until the inputs are
usable. The produce button sends the plant factors, the intake and the plant engine's warnings; the total
TPH button sends the total level, the fraction table and the warnings, and the cleanup screen shows them.

The "Wildlife dose (site-specific)" group turns the Eco-SSL wildlife screen into rows you can change. Pick a
chemical that has an Eco-SSL document and press "Load the surrogates from the Eco-SSL document": each bird
and mammal surrogate appears with its printed toxicity reference value, food ingestion rate, soil share of
the diet, uptake form and coefficients, and the table and page of the document they came from. Every factor
can be edited, an area use factor (1 reproduces the Eco-SSL) is added, and you can add a surrogate of your
own. The ecological screening panel then shows, per surrogate, the daily dose, the hazard quotient at the
soil concentration, the soil level at which that quotient is one, and the Eco-SSL the document printed, so a
change can be read against its source. These are screening comparisons, never cleanup levels, and the
screening-only warning stays. The rows are saved in the project file, and a CSV table of them is offered.

### Site model (`#/site`)

A planning aid, not a gate. Answer six questions about the site: who is exposed (human or ecological), whether
you enter source concentrations directly or use the models, the single source medium, whether the exposure point
is onsite or downgradient, the vapor intrusion method (shown when the source is indoor air from soil or soil gas)
and whether homegrown produce takes its contaminant from the soil or from irrigation water. The page lists the
screens to visit in that order, links to each, and names the feed button to press on it (for example **Use as
groundwater source** on vadose leaching, then **Use as exposure well concentration** on transport).

Some combinations are not allowed, and the page says why instead of listing screens: no source medium, more than
one source medium (run the others as separate projects; when you have both soil and soil gas for indoor air,
soil gas is the better basis), produce from soil and from irrigation water together, and produce from a medium
that is not its source (soil for soil produce, groundwater for irrigation). Nothing on any other screen is
locked or changed by these answers. They are saved with the project, and the report shows them as one line
above the screen sections when they differ from the defaults.

### Chemical database (`#/chemicals`)

A read-only browser over the EPA Regional Screening Level chemical data the calculations use (edition
2024-11, shown on the screen). Search by name or CAS number, then open a chemical to see its physical and
chemical properties and its toxicity values. Each row gives the value as stored, its unit and its source:
the reference named in the property table, or for toxicity the name of the agency behind the value. Flags
such as volatile and mutagen, and a few screening values without a per-value reference, are listed with
the source "RSL table". The data carries no carcinogen weight-of-evidence class, so none is shown.
**Download CSV** saves every value of every chemical, or just the chemicals that match the search, one row
per value with a source column. Values cannot be edited here; the full file loads the first time the
screen opens, so it needs a connection that first time.

### Exposure and risk (`#/risk`)

Pick chemicals from the EPA Regional Screening Level tables, enter concentrations in soil, water and air (or
take the groundwater concentration from the transport screen), and see the cancer risk and hazard index
each method gives, the pathways and chemicals that drive them, and what could not be quantified. A second
receptor can be evaluated alongside the first.

**Edit values** on a chemical card lists the four toxicity values (oral slope factor, inhalation unit risk,
oral reference dose, inhalation reference concentration) with the database value and its source. Type a
value to use for this project and a short source note; both are required, and a value without a note, or
not above zero, is flagged and not used. An edited field is marked with the word "Edited" and a tint, and
the table above shows the value with the source "User value (this project)". **Reset to database value**
undoes one field. A value the database lacks can be supplied the same way. The database holds chronic
values, so for a short-term case enter the reference dose that applies and say so in the note. The edits
belong to the project, not to the screen: the cleanup screen shows the same values, the uncertainty runs
use them as point values, the project file keeps them, and the report lists them under "Values supplied by
the user" with the database value beside each. The master database is never changed.

Each receptor panel has two more project-level edits. **Receptor name (optional)** replaces "Receptor A" or
"Receptor B" in the panel, the result tables, the downloads and the report. **Edit exposure factors** lists
the preset's body weight, exposure duration and frequency, soil ingestion rate, swimming water ingestion
and the cancer averaging time (lifetime) for the legacy method, the same scalars for each life stage of the
modern method (child and adult, or worker), and the averaging time for both. The preset's value is shown
under each box; a blank box keeps it. An edited factor is marked "Edited" and has its own **Reset to
preset**, and a **Reset to preset** under the list clears the receptor's edits. A factor needs no source
note. A mutagen's age segments use the stage value, and the modern exposure duration (which sets the stage
split) is not editable. The soil skin area, adherence, water, breathing and time entries stay under
"Site-specific factors". Changing the scenario preset of a receptor that has edited factors asks first: the
edits belong to the old preset, and switching resets them. The exposure and cleanup screens keep their own
receptor edits. The uncertainty runs centre on the edited values, the project file keeps the edits, and
the report lists them under "Receptor factors supplied by the user" with the preset value beside each.

### Cleanup levels (`#/cleanup`)

Chemical cards carry the same **Edit values** panel as the exposure screen, and share its edits. The
receptors carry the same name and **Edit exposure factors** panel, but their own edits: a factor changed
on the cleanup screen does not change the exposure screen.

The reverse calculation: choose chemicals, receptors and pathways, set a target cancer risk and hazard
quotient, and see the concentration in soil, water or air that just meets them. The lower of the cancer and
noncancer levels governs, and the screen says which one did.

Homegrown produce and total petroleum hydrocarbons come from the plants, ecology and TPH screen. For
produce, send the plant factors from that screen, switch on "plant factors for homegrown produce" on the
chemical and "Homegrown produce" on the receptor: the soil level then includes the produce pathway
(it is also listed on its own under each pathway alone), and the plant engine's warnings appear with the
cleanup warnings. The produce pathway is added to a direct soil source only, not to a modeled one. For
total TPH, send the total level from that screen: a "Total TPH level" panel shows it beside the chemical
levels with its fraction table, method id and warnings, and it has its own CSV download. The total is a
hazard index level held from that screen, so change the composition there and send it again.

### Uncertainty analysis

The risk and cleanup screens each have an uncertainty section. Give an input a distribution to sample it;
inputs left as point values stay at the value above. Run the analysis to see how much the answer could vary
and which inputs drive it. The distributions, sampling kind, number of iterations and seed are saved in the
project, so a run repeats exactly.

### Report (`#/report`)

The report is built from the project: the inputs of each screen you used, each screen's result tables, the
engine warnings, a methods statement that names the methods you chose with numbered references, and the
non-affiliation notice. Each screen's main charts are included too, every one followed by its data table
(the plume map stays on its screen). Charts print in shades of grey, so a black and white print stays
readable. **Print or save as PDF** uses your browser's print dialog, which has a PDF option. The optional
"Prepared by" field is not saved to the project.

Uncertainty results are left out until you ask. In the uncertainty section, tick **Include uncertainty
results** to repeat each analysis you set up on the exposure and cleanup screens, from its saved
distributions and seed, so the numbers match the screens. A progress bar shows the run. The exposure
sample runs in the background and **Cancel run** stops it. The one-at-a-time and Sobol runs and the
probabilistic cleanup solve run in the page itself, so the page may stop responding until they finish and
they cannot be cancelled once started; a very long run asks you to confirm first. The report then shows the percentile summary, the
chart of the spread, which inputs matter (tornado, Spearman and, if switched on, Sobol), the seed and the
iteration count, and the probabilistic cleanup levels. A panel with no distribution set is skipped with a
note saying why. Results are not saved with the project.

### Downloading tables

Result tables have a Download CSV button. The file name carries the table name, the app version, the data
editions it used and the date, so a file can be traced to what produced it.

## Documentation and sources

- This reader (`#/docs`) shows this guide, every methods note and the attributions.
- Methods and References (`#/methods`) lists every registered method with its kind, assumptions and sources.
- The attributions document records the science and the data provenance. Third-party software licences are
  kept in a separate document in the repository.

## Reporting a problem

Open an issue on the project's repository:
[github.com/bmills23/model_flow/issues](https://github.com/bmills23/model_flow/issues). Please describe what
you entered and attach the saved project file if you can; it holds your inputs and nothing else.
