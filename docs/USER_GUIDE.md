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
- Charts that show a value under the pointer can be read from the keyboard too: tab to the chart and use the arrow
  keys (Left and Right on the breakthrough curves, with Home and End; Up and Down on the depth and vapor profiles;
  all four on the plume map, one grid cell per press). The reading appears in the line below the chart. Every
  chart also has a data table.

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
- Project files are now format version 2, which keeps one sent value per chemical (see "Results sent between
  screens carry their chemical" below). A file, link or browser copy from the earlier format opens as before:
  each sent value moves to the chemical it was made for, or, when it records none, to the chemical its
  sending screen was set to. A value whose chemical cannot be told (its screen had the chemical typed by
  hand) is dropped and named, and your inputs still load. A value that was current when the file was saved is
  still current after it opens. A version of the app from before this change refuses a version 2 file with
  its newer-version message.
- A value passed between screens records which inputs it was built from. The moment those inputs differ
  from what was sent, a note at the top of the page names the value, the chemical it was sent for and the
  screen that sends it, and says it was built from inputs that have since changed. Each chemical's value is
  marked on its own: changing the inputs while a screen is set to toluene marks its toluene value and not the
  benzene value it sent before. While a screen is set to another chemical, a value it sent keeps the mark it
  had, and is checked again when the screen is set back to that chemical. This holds while you work, for every value passed
  between screens (including the groundwater run offered to the cleanup screen, the well method you chose
  and the vapor source series). In a project you open, the mark follows edits to the form that sent each
  value; the extras above (the well method, the vapor source series, the groundwater run for cleanup) are not
  saved in the file, so they are taken as they are when the project opens and only changes after that mark
  the value. The value stays as it was sent and is never
  refreshed silently. The note goes away when you send the value again or edit the inputs back to what
  was sent; Dismiss hides it for the values it lists, and it comes back for a value that goes out of date
  later.
  The screens that use such a value say so beside it with an "Out of date" label and the screen to send it
  again from: the chemical cards on the exposure and risk and cleanup screens, the cleanup source level
  panels (household, vapor, surface water and TPH), the groundwater run behind a modeled cleanup level, and
  the screens that read a series from another screen (transport, vapor, household, surface water). The
  uncertainty analyses on the exposure and cleanup screens carry the same label and the same CSV marking
  when the values they sample were passed from another screen. The
  values stay visible. The report puts the same label under the heading of each section that reads such a
  value and again in that section's notes. A CSV download that holds such values gains a last column,
  `stale inputs`, carrying the same text on every row, and `-stale-inputs` is added to its file name; a
  current file is unchanged. A note beside the download says which values are out of date, and for which
  chemical.
- **Share link** puts the project in the address after the `#`, compressed. A hash is never sent to a
  server, so the link carries the project without anyone hosting it. The link does not include the values
  passed between screens; whoever opens it sends those again from their source screens.
- A link longer than 8000 characters is not offered, because chat and mail programs often cut longer ones.
  Save a file instead. The app shows the limit rather than a shortened link.
- Opening a project, from a file or a link, asks first when the current project has changes not saved to a
  file. This includes work restored from the browser's automatic save after a reload, until it is saved to a
  file. The reload and close warning does not appear for restored work until it is edited again.
- Closing or reloading the tab also asks first while the project has changes not saved to a file, because the
  browser's copy of the project is not a saved file and a browser can clear it. A reload that only brings the
  browser's copy back does not ask: the warning starts again with your next edit after the reload.
- **Type numbers with a decimal comma** (a checkbox under the project buttons) lets you type and read
  "1,5" for 1.5 in every number box. It is a setting of this browser only. Saved files, share links and CSV
  always use the point. With it on, a box shows a message and keeps your text when it cannot tell what you
  meant: both a comma and a point, more than one comma, or a thousands-style group such as "1.234". Retype
  the number with a single comma. A box that cannot be read blocks the calculation until you fix it, and
  that text is never saved: a saved file or link holds that box as empty. Name and citation boxes are
  plain text and are not affected by this setting.
- The project now keeps a list of its chemicals, filled from the chemicals on the risk and cleanup screens
  and the one chosen on each other screen. The surface water, groundwater transport, vadose zone, saturated source, vapor intrusion, household and
  plants screens pick their chemical from it. An older file or link opens with
  the list filled in the same way, and none of its sent results turns stale because of it. An older version
  of the app opens a file that has the list and ignores it, with its usual warning about an unknown field.
- Private windows or a full browser store can stop the automatic copy. The app then works as usual and only
  the reload recovery is lost.
- The automatic copy of a version 2 project is kept under its own name in this browser, so a tab still
  running an older version of the app cannot overwrite it. A copy made by the older app is read once and copied
  to the new name; the older app's copy is left as it is. If the copy was saved by a newer version of the app than
  this tab runs, a short notice under the project bar says so and this tab does not save over it.

## Screens

### Chemical database (`#/chemicals`)

A browser over the EPA Regional Screening Level chemical data the calculations use, read only (edition
2024-11, shown on the screen). Search by name or CAS number, then open a chemical to see its physical and
chemical properties and its toxicity values. Each row gives the value as stored, its unit and its source:
the reference named in the property table, or for toxicity the name of the agency behind the value. Flags
such as volatile and mutagen, and a few screening values without a per-value reference, are listed with
the source "RSL table". The data carries no carcinogen weight-of-evidence class, so none is shown.
**Download CSV** saves every value of every chemical, or just the chemicals that match the search, one row
per value with a source column; chemicals you define are included, with the source "User value (this project)"
and your note. The EPA values cannot be edited here (a toxicity value is edited on a chemical card, see Edit
values); the full file loads the first time the screen opens, so it needs a connection that first time.

Trichloroethylene and vinyl chloride are marked as RSL special cases. For the resident and child receptors the
modern method computes their cancer risk with the equations the RSL User's Guide gives for them (trichloroethylene
splits its slope factor and unit risk into a cancer part and a mutagenic part; vinyl chloride adds the child's
unaveraged dose), so cleanup levels and the other screens that use the modern method follow. A worker uses the
ordinary equation, as the RSL does, and the results carry a warning that says so. If you edit the slope factor or
unit risk of either chemical, the same equations are applied to your value in the guide's proportions and a
warning says so. The legacy method has no age adjustment and is unchanged.

The screen opens with **Project chemicals**, the one list of chemicals the project works on. **Add to project**
beside a chemical puts it on the list (a chemical already on it reads "In the project"). **Remove** takes a
chemical out of the whole project, after asking: the question names what goes with it, which is its row and
everything entered on it on the exposure and risk and the cleanup levels screens, and the results held for it
(the groundwater well result, the vapor air result and so on). A screen set to a database chemical keeps that choice and
shows it as no longer in the list. For a chemical you defined, removing also deletes its surface water target and
toxicity values, and a screen set to it is set back to no chemical (the values typed on that screen stay); a chemical you
define later does not inherit any of it. Removing cannot be undone.

**Define a new chemical** makes a chemical that is not in the EPA tables. Only a name is required. You may add a
CAS number (a number the database already holds is refused, with a pointer to the overrides, because that
chemical exists: add it to the project and edit its toxicity values with Edit values instead) and any of ten values: the four
toxicity values (oral slope factor, inhalation unit risk, oral reference dose, inhalation reference
concentration) and molar mass, solubility, Henry's constant, Koc and the two diffusivities. Every value you
enter needs a source note; a value without one, or not above zero, stops the save. **Copy as a new chemical**,
beside a database chemical, starts the form from that chemical's values. Each copied value carries the note
"Copied from the EPA RSL tables, edition ..., for <name> (CAS ...); source: <the source the database gives>", which you
can edit; the CAS number is not copied. **Edit** on a chemical you defined reopens the form; a new name is carried to its rows on the exposure and risk and cleanup levels screens, so every table and the report show it. A chemical you
defined is on the exposure and risk and cleanup levels screens (it carries only the values you entered), and on the transport, vadose, saturated, vapor and plants and
ecology screens, which fill what you entered and say which value is missing when it is chosen. The report lists each one
under "Chemicals defined by the user" with every value, its source (user) and its note. The project file keeps
them. A share link carries them too, but a link longer than 8,000 characters is refused (about six chemicals with every value
and a note of a sentence each still fit); use Save project then.

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
that is not its source (soil for soil produce, groundwater for irrigation), and ecological receptors with any source
other than soil (the ecological screen takes a soil concentration only, so only soil is supported; for soil the
steps are the chemical database, the plants and ecology screen, then the report). Nothing on any other screen is
locked or changed by these answers. They are saved with the project, and the report shows them as one line
above the screen sections when they differ from the defaults.

### Groundwater transport (`#/transport`)

A dissolved plume from a finite source in uniform groundwater flow, with retardation and first-order decay.
Compare the legacy AT123D-class method with the modern exact solution at a receptor and across the site.
Buttons below the result send the well concentration to the risk screen, the aquifer to cleanup levels, the
water table concentration to vapor intrusion and the plume to surface water.

Under the plume map, **Download CSV: plume grid** saves the whole map grid as a table: one row per grid cell
with the method, the downgradient distance x (m), y (m) and the concentration (mg/L) at the time shown on the
map. The transport table's own CSV does not carry the plume grid.

Dispersivity is an entry you make. A new project starts on **Entered value** with no number, and the screen asks for the longitudinal, transverse and vertical dispersivity (m) before it computes. Beside it you can choose the **EPA SSG 1996 rule** (the longitudinal value is 0.1 times the distance to the receptor, so the receptor x must be greater than zero; you still enter the transverse and vertical values), or the **RISC5 regression (no primary source)**, which keeps the old numbers but says in the results' warnings that its coefficients have no primary source. Xu & Eckstein 1995 and Schulze-Makuch 2005 are still offered. A project saved before this choice opens on the law it used, with the same numbers.

The Chemical select lists the chemicals of the project (add them on the chemicals screen). It fills Kd from the database Koc times the organic carbon fraction you enter; the half-life is not in the database and stays your input. If the database has no Koc for the chemical (hydrogen cyanide and mercury), the retardation settings stay as they are and a note says so. A project chemical without fate data here (the data covers the chemicals of the vapor screen) is marked unavailable and nothing is filled.

### Vadose leaching (`#/vadose`)

A source in unsaturated soil loses chemical to the air and to infiltrating water. Follow the leachate to the
water table with the legacy or the modern layered model. The screen shows the source and leaching, the
arrival at the water table, a mass budget, and a validation case you can load. It can feed the groundwater
and vapor screens.

Dispersivity is an entry you make. A new project starts on **Entered value** with no number, and the screen asks for the longitudinal dispersivity (m) before it computes; one value serves the whole column. The only other choice is the **RISC5 regression (no primary source)**, which varies with depth in the legacy method and is warned in the results; no open source for a vadose-zone rule was found, so none is suggested. The **Reset to the Table R-7 case** button chooses the regression, because that table gives no dispersivity. A project saved before this choice opens with a blank dispersivity as the regression and a typed one as an entered value, with the same numbers.

The Chemical select lists the chemicals of the project (add them on the chemicals screen) and fills molar mass, solubility, Henry constant, Koc and both diffusivities from the EPA RSL tables; every value stays editable, and the leachate decay rate stays your input. A project chemical without fate data here (the data covers the chemicals of the vapor screen) is marked unavailable and nothing is filled.
Each soil layer (the source and every layer above and below it) has a Texture preset. Choosing one of the twelve classes fills porosity, residual water content, van Genuchten n, saturated conductivity and bulk density with the class averages the vapor screen uses; thickness and organic carbon stay yours. Every filled value can be edited afterwards, and Custom values leaves the numbers as they are.

### Saturated soil source (`#/saturated`)

Chemical in soil at or below the water table dissolves into the groundwater flowing through it. Release it
at a constant rate until it is gone (legacy) or in proportion to the mass left (modern). The release can
feed the groundwater and vapor screens. A worked example is built in.

The Chemical select lists the chemicals of the project (add them on the chemicals screen) and fills molar mass, solubility, Henry constant and Koc from the EPA RSL tables; every value stays editable, and the source decay rate stays your input. A project chemical without fate data here is marked unavailable and nothing is filled.
The Texture preset in the Soil group fills porosity, bulk density, residual water content and van Genuchten n from the twelve class averages the vapor screen uses. Organic carbon and the aquifer conductivity stay yours. Every filled value can be edited afterwards, and Custom values leaves the numbers as they are.

### Vapor intrusion (`#/vapor`)

Vapors from soil, soil gas or groundwater diffuse through the soil and enter a building. The legacy and
modern Johnson and Ettinger methods run on one set of inputs, with indoor air results, the vapor profile
through the soil and a check against a published case. Its "Chemical" list is the project's chemical list, and
picking one fills the properties from the EPA tables; the Table R-3 benzene test values stay available beside the list
as a test case, not a project chemical. A project chemical with no vapor properties in the database is marked as
unavailable, you can enter its properties by hand, and it cannot be sent on.

The oxygen-limited method (DeVaull) is the third choice of "Method shown in detail", for petroleum vapors that
degrade only where oxygen reaches them. The soil between the source and the foundation is split into a deeper layer
with no oxygen and a shallower aerobic layer where the chemical degrades at a first-order rate; the strata below the
floor are treated as one layer with averaged porosity and water-filled porosity. The **Oxygen-limited
biodegradation (DeVaull)** group (it opens when the method is chosen) takes the aerobic rate (filled from the
chemical's class when you pick it; blank means no credit for biodegradation, with a warning) and one of three ways
to set the aerobic layer: **Aerobic layer depth entered**, **Fast reaction front** (chemical and oxygen meet at a
front), or **Coupled oxygen balance** (the depth where the oxygen supply just meets the demand). The last two need
the oxygen at the base of the foundation (percent by volume), the oxygen mass ratio (filled for classed chemicals),
the oxygen diffusion coefficients in air and water and the oxygen Henry's constant (no defaults: enter them from your
own source), optionally the total hydrocarbon vapor at the source (blank: the chemical alone sets the oxygen demand,
with a warning that the aerobic layer is overestimated) and a switch for baseline soil respiration. The method adds
a column to the comparison table, a details panel (layers, fluxes, oxygen balance), a curve on the vapor profile and
two CSV tables, and its warnings join the list. It gives indoor air only; the outdoor air panel stays with the
legacy box and the Soil Screening Guidance factor. With the method chosen, "Send to exposure and risk" sends its
indoor air (tagged with the method and the chemical) and no outdoor air.

### Surface water and sediment (`#/surface-water`)

A groundwater plume that reaches a river or lake discharges through the bed. Mix it into the water body to
get the surface water concentration, find the sediment concentration by equilibrium partitioning, and
compare the well-mixed box (legacy) with the mass-discharge method (modern). The criteria and exposure
section compares the result with water quality and sediment criteria.

The comparison has a "Criteria set" choice. The default is the United States pair: the EPA national
recommended water quality criteria (aquatic life and human health) and the EPA Region 4 sediment benchmarks.
The other choices are Canada (CCME water and sediment guidelines), the European Union (Directive 2008/105/EC
environmental quality standards), the United Kingdom (England and Wales standards directions), Australia and
New Zealand (ANZG 2018 default guideline values), the MacDonald et al. (2000) consensus sediment guidelines (TEC
and PEC), and all of the sets side by side. Pick the set, find a chemical by name or CAS number, and the peak of
each series is compared with every criterion of that chemical in the set, one ratio per criterion, never summed.
Each value is shown with its basis in words (acute or chronic, annual average or maximum allowable
concentration, the level of species protection, TEC or PEC), the set, the water type and the table it was read
from, and a Note opens the condition the source prints with it (a hardness class, a bioavailable fraction, a
background added to the standard). A value the source gives only as an equation or a site rule, and that no
equation comes with, reads "site-specific, not computed". The EU, UK and ANZG sets hold water only and the
MacDonald set holds freshwater sediment only, so those comparisons have no sediment or no water table. A
chemical a set does not name says so; choose another set. The set you choose is saved with the project (a
project that never chose one opens with the United States pair). Download CSV: criteria comparison writes
every row with its set, basis, medium and source, and the report prints the same comparison for the chemical of
the run (freshwater and saltwater together, at the default hardness) and cites the sets it read.

### Shower, irrigation and particulates (`#/household`)

Household exposure from tap and irrigation water and from surface soil: shower air, sprinkler spray and
irrigation contact, and windblown particulates, each with a legacy and a modern method. Values that no
primary source supplied are left blank for you to enter; values taken as RISC5 choices carry a warning. The
result can be sent to the risk and cleanup screens. The chemical is picked from the project list (the old typed
name and CAS number boxes are gone); the Henry constant and molecular weight stay boxes you fill in. A project that
has no chemicals yet shows a link to the chemicals screen in their place.

### Plants, ecology and TPH (`#/plants-eco`)

Homegrown produce plant factors for the risk screen, screening ecological hazard quotients, and total
petroleum hydrocarbon levels from a fraction composition. Nothing is defaulted from memory: a value without
a primary source is yours to enter, the chemical is picked from the project list (an RSL chemical fills log Kow, Koc
and Kd; a chemical the RSL does not list is marked and left for you to enter), and the button that sends a result on stays disabled until the inputs are
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
screening-only warning stays. Where the back-calculated soil level differs from the printed Eco-SSL by more
than 5 percent, the printed value carries the text "Not reproduced within 5 percent", so the difference is
read in words, not colour. Rows you add yourself have no printed value and no such flag. The rows are saved in
the project file, and a CSV table of them is offered; its last column says yes or no for each surrogate.

### Exposure and risk (`#/risk`)

Pick chemicals from the EPA Regional Screening Level tables, enter concentrations in soil, water and air (or
take the groundwater concentration from the transport screen), and see the cancer risk and hazard index
each method gives, the pathways and chemicals that drive them, and what could not be quantified. A second
receptor can be evaluated alongside the first.

The chemicals here are the project's chemical list: every chemical on it has a card, and a chemical you find
with the search on this screen is added to the list (and so to the cleanup levels screen). A chemical this
screen has not seen before gets a card with nothing set, which says so and adds nothing to the results until a
concentration is typed or a result from another screen is used; it does not stop the other chemicals from
running. **Remove** on a card asks first and then removes the chemical from the whole project. A project
chemical that is not in the RSL tables is named under the search and has no card. A project saved before the
screens shared the list opens with the union of both screens' chemicals, each keeping the concentrations and
choices it had; the cards the other screen lacked start with nothing set.

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
preset**, and a **Reset to preset** under the list clears the receptor's edits. Each factor has a
**Source note (required)** box beside it: a value you type is not used until you add a note, the box says so,
and clearing the note stops the value being used again. A project saved before notes were required opens
unchanged; its edits stay in use and are marked "No note" (with no warning that the value is unused) until you add one; typing a new value over one asks for a note like any new edit. A mutagen's age segments use the stage value, and the modern exposure duration (which sets the stage
split) is not editable. The soil skin area, adherence, water, breathing and time entries stay under
"Site-specific factors". Changing the scenario preset of a receptor that has edited factors asks first: the
edits belong to the old preset, and switching resets them. The exposure and cleanup screens keep their own
receptor edits. The uncertainty runs centre on the edited values, the project file keeps the edits, and
the report lists them under "Receptor factors supplied by the user" with the preset value and the source note
beside each ("no note" when none was given).

### Cleanup levels (`#/cleanup`)

The reverse calculation: choose chemicals, receptors and pathways, set a target cancer risk and hazard
quotient, and see the concentration in soil, water or air that just meets them. The lower of the cancer and
noncancer levels governs, and the screen says which one did.

The chemicals are the same project list as on the exposure and risk screen: a chemical added here, there or on the
chemicals screen appears on both, and **Remove** (after its question) takes it out of both and out of the project.
Each screen keeps its own concentrations and choices per chemical; a chemical this screen has not seen starts with
nothing set. The levels need no concentration unless the allocation is cumulative.

Chemical cards carry the same **Edit values** panel as the exposure screen, and share its edits. The
receptors carry the same name and **Edit exposure factors** panel, but their own edits: a factor changed
on the cleanup screen does not change the exposure screen.

Homegrown produce and total petroleum hydrocarbons come from the plants, ecology and TPH screen. For
produce, send the plant factors from that screen, switch on "plant factors for homegrown produce" on the
chemical and "Homegrown produce" on the receptor: the soil level then includes the produce pathway
(it is also listed on its own under each pathway alone), and the plant engine's warnings appear with the
cleanup warnings. The produce pathway is added to a direct soil source only, not to a modeled one. For
total TPH, send the total level from that screen: a "Total TPH level" panel shows it beside the chemical
levels with its fraction table, method id and warnings, and it has its own CSV download. The total is a
hazard index level held from that screen, so change the composition there and send it again.

Vapor source levels: send the indoor and outdoor air from the vapor screen ("Send to exposure and risk"),
add the chemical here, and a **Vapor source levels** panel lists the groundwater, soil gas, soil pore water
or soil concentration that gives each indoor and outdoor air level above; the legacy and modern receptor
methods each get a row, with the vapor method id beside it. The **Level from** column says how each level was
found. Where the vapor run showed the air proportional to its source (the legacy and modern Johnson and Ettinger
methods, the legacy box, the Soil Screening Guidance factor and the oxygen-limited method with an entered aerobic
layer depth, or with the total hydrocarbon vapor entered, which fixes the oxygen demand) the level is the air level
divided by the run's air-over-source coefficient, marked **Linear coefficient**. Where it is not, the level is
**Solved**: the source whose forward air, run through the same vapor model you sent, equals the air level, found
with the same root solve as the modeled cleanup. That covers a soil source with a TPH mixture, the oxygen-limited
fast reaction front or coupled option when its oxygen demand comes from the source vapor itself (the aerobic layer
then moves with the source), the legacy box over such a source, and any other path the vapor run could not confirm
as proportional. The solve searches up to the solubility (groundwater and pore water), the vapor in equilibrium with
the solubility (soil gas), the residual-phase limit (soil, where the model's vapor stops rising) or, with a TPH
mixture, the point where the chemical would be the whole mixture. An air level the model does not reach by that
limit is listed with the limit and the most air the model gives there, and no level, never zero; the same holds
for a soil level above the residual-phase limit. A cancer or noncancer level the model does not reach is left out
with a warning that names the limit. A path that is not quantified for another reason (a model input missing, a
Soil Screening Guidance factor for a source series, a model that transfers nothing from the source) keeps its reason
and no level. A source series sent from another screen gives the same result as a single value, because the steady
method is applied at each time. Change the vapor inputs and the note at the top of the page marks the sent vapor air as
out of date; the panel keeps the values you sent until you send again. A project saved before this panel existed carries
no coefficient, and the panel says to send the vapor air again; one saved before the solve existed does the same for
a row that is not proportional to its source. The send button is off while the vapor inputs have an error.

The household, vapor and surface water tables are in the cleanup CSV downloads (one file each, only for a run that has been sent) and in the report; a level that is not quantified keeps its reason in the file, and the vapor table has a `level from` column (linear coefficient or solve).

Surface water source levels: when the surface water screen has sent a result (the "use ... for swimming" buttons),
and a swimming pathway is on, a **Surface water source levels** panel lists the source concentration that gives
each surface water level. The **Level path** column says how each was found. **Linear**: the run is linear in a
dissolved groundwater source, so the level (in mg/L) is the surface water level divided by the run's
coefficient (the peak surface water concentration per unit of groundwater source, taken from the run you sent, for
the series you sent), and a groundwater source at that level alone just meets the target. **Solved**: the run is not
linear in its source, so the panel runs the surface water model forward until its peak meets the level, with the
same root find as the modeled cleanup, in the background (a "solving" note shows while it runs; a linked run takes
a few seconds to about a minute). This covers a run with an upstream background (the answer is a groundwater
concentration, in mg/L) and a plume fed by a vadose or saturated source screen (the answer is the soil
concentration of that screen, in mg/kg, and the Source column says so). A level the source cannot reach is shown
as not quantified, naming the limit it was searched up to (the solubility entered on the surface water screen for
a dissolved source; a pure substance, or the bound the TPH sets, for soil) and the most the surface water reaches
there; a level at or below what the upstream background alone gives has no source level. A soil level above the
soil saturation concentration carries a free product warning. Each surface water run is kept for the chemical it
was sent for, so the panel quantifies a level only for the cleanup row of that chemical; a row of another chemical
reads "not quantified" and says why. The send buttons are off while the surface water screen shows an engine error,
so only a current result is sent. The level still reads "not quantified", with the reason, when nothing transfers to
the surface water, when the linear source level would exceed the solubility entered on the surface water screen, or
when the result was sent before the solve existed (send it again: an older result carries the run's coefficient but
not the request the solve needs). When the surface water inputs change after the send, the note at the top of the
page marks the sent series as out of date, and the panel keeps using what was sent until you send again.

Surface water target: the cleanup screen has a **Surface water target** section with one choice per cleanup chemical: none,
an **NRWQC criterion**, or **My value**. An NRWQC criterion is read from the shipped EPA National Recommended Water Quality
Criteria tables; pick the kind of criterion from the list (the default is the freshwater chronic aquatic life criterion, else
the human health criterion for water and organism consumption; a criterion that needs hardness, pH or other site inputs is not
listed). My value is a concentration in ug/L and needs a note saying where it comes from. A **Surface water target source
levels** panel then gives, for each chemical, the source level that just meets the target, from that chemical's own
surface water run. For a dissolved groundwater source whose run is linear it is the target divided by the peak surface
water concentration per unit of source (mg/L, **Linear**). A run with an upstream background, or a plume fed by a
vadose or saturated source screen, is **Solved** against the surface water model, as in the panel above (mg/L for the
groundwater concentration, mg/kg for the screen's soil concentration). A soil source of this cleanup (the "Soil, vadose
zone" and "Soil, saturated" sources) is also solved: the vadose or saturated run sent to the cleanup screen is carried
through the aquifer and bank of the surface water run, so that run must be linked to a groundwater transport run (a
well-mixed surface water run uses the legacy vadose and saturated methods, a mass-discharge run the modern ones). A
target the source cannot reach is shown as not reached, with the limit, as above. The row
shows the target in ug/L, its basis, the citation of the table or "User value (this project)" with your note, the source
and its unit, how the level was found, and the stale
mark of the surface water result. A chemical with no criterion, no surface water result sent, or a run without the
request to solve it says which is missing (send the surface water result again).
The rows are in the CSV downloads (one file; the **level path** and **solve detail** columns say linear or solved) and in
the report.

A modeled source (groundwater, vadose or saturated soil source carried to the well) takes any number of
chemicals. Each chemical is solved on its own through the groundwater, vadose or saturated run sent for it, so send
each chemical's run from its screen. A chemical whose run is missing, was made for another chemical, or does not
record its chemical (when the run holds two or more) gets that problem on its own row and is left out, and the
other chemicals are still solved. A chemical with no run of its own says so under Source ("no aquifer run held for
Toluene (the run held is for Benzene)"); it does not borrow another chemical's run. With two or more chemicals each
has its own heading, with its results, warnings and notes under it, its own "Out of date" mark and CSV files. A
progress line counts the chemicals on screen ("2 of 3 chemicals solved"): chemicals already solved and unchanged
count as solved, and a chemical that cannot be built yet is in the total, with a note of how many cannot be solved.
Changing one chemical's inputs solves only that chemical again and greys only its results; the CSV download stays
available and holds the current chemicals, and the chemical being solved again joins it once its result lands.

A modeled source also has its own
**Probabilistic cleanup level, modeled source** panel once the level above is solved. With several chemicals a
select above the panel chooses the chemical it samples, and each chemical keeps its own last result for the report. Choose the legacy or
modern transport method, give some inputs a distribution and run: every draw is a full solve through the
transport chain, so the draws run in the background, a progress bar shows them, the page stays usable and
**Cancel run** stops the run. The inputs offered are the aquifer values of the groundwater screen (seepage
velocity, porosity for the legacy method, retardation, decay rate and the three dispersion coefficients,
each sampled on its own, so a sampled velocity does not rescale the dispersion), the inputs of the vadose
or saturated source method (the vadose longitudinal dispersivity only when you entered one, since the regression has no value of its own to vary), and with the legacy method the receptor factors. The source concentration is
never offered, because it is the level being solved. A solve takes tens of milliseconds for a dissolved
source and from under a second to several seconds for a soil source, so the iteration count defaults to
200 rather than 1000; a run projected over a minute asks first and one over 10 minutes is refused. When
fewer than 10 draws lie below the chosen protection level, the results carry the warning
`uncertainty.small-sample-tail`. The method, distributions, iteration count, protected fraction and seed
are saved in the project. The report does not compute a modeled source; with **Include uncertainty results**
ticked it prints the result of the last run made here (see the report section below).

The project's full mobile layout check (`corepack pnpm mobile:check:full`) runs this panel in a browser with a sampled
seepage velocity and the default 200 iterations, then opens the report with **Include uncertainty results**
ticked, so the printed modeled-source block is checked for overflow and accessibility on a phone and a desktop.

### Uncertainty analysis

The risk and cleanup screens each have an uncertainty section. Give an input a distribution to sample it;
inputs left as point values stay at the value above. Run the analysis to see how much the answer could vary
and which inputs drive it. The distributions, sampling kind, number of iterations and seed are saved in the
project, so a run repeats exactly.

### Report (`#/report`)

The report is built from the project: the inputs of each screen you used, each screen's result tables, the
engine warnings, a methods statement that names the methods you chose with numbered references, and the
non-affiliation notice. Each screen's main charts are included too, every one followed by its data table
(including the groundwater plume map; its printed table is an evenly spaced sample of 20 centreline rows, and the groundwater screen's table holds every row). Charts print in shades of grey, so a black and white print stays
readable. **Print or save as PDF** uses your browser's print dialog, which has a PDF option. The optional
"Prepared by" field is not saved to the project.

The top of the report gives the generation date, the app version (0.1.0 while the evidence gap against
published tables is open) and the short commit the build was made from ("unknown" when the build could not
read it). A commit followed by "-dirty" means the build was made from a tree whose tracked files differed from
that commit, so the commit alone does not name what was built; untracked files do not add the mark. A project you save is stamped with the same version.

Each section ends with **What this run rests on**, a table of the values in that section that no checked
source backs: built-in defaults that carry a warning (with the note and the reference status), fate
properties typed with no database chemical, properties typed over the database value (with the database value
beside), toxicity values and chemicals you supplied, and receptor factors you edited, each with its source note
or "no note". A section that reads values sent from another screen also lists that screen's rows, marked with
the sender and "out of date" when the sent values no longer match. A summary under the title counts the rows by
kind and names the unverified defaults used. **Download CSV: run basis** saves the same rows in one file with a
screen column; when any row is out of date the file gains a stale inputs column and a `-stale-inputs` name
suffix, like the other downloads. Beside each method name the report prints the method id and "checked by N
published examples", a link to the validation page; N counts the reproduced worked examples that name the
method, not named exceptions, pending cases or smoke tests. Both dispersivity regressions are listed only
when their warning fires, that is when you chose a regression for the dispersivity instead of entering a
value.

Each screen's values are compared with the source that screen fills from: the plants and eco screen's Koc and
log Kow with the cleanup property file, the other screens with the chemical property rows (plus the chemicals
you defined). The rows inherited from another screen are read from that screen's form as it is now, which
holds one chemical. For a modeled cleanup with several chemicals the report therefore lists only the chemical
currently selected on the vadose or saturated screen, and says so above the table; the other chemicals'
entries are not listed. While the run basis is still being built the report says so, and if the chemical
database fails to load it says the basis could not be built and leaves out the summary, the tables and the
run basis CSV; do not print a report in either state as a record of what the run rests on.

Uncertainty results are left out until you ask. In the uncertainty section, tick **Include uncertainty
results** to repeat each analysis you set up on the exposure and cleanup screens, from its saved
distributions and seed, so the numbers match the screens. A progress bar shows the run. The exposure
sample runs in the background and **Cancel run** stops it. The one-at-a-time and Sobol runs and the
probabilistic cleanup solve run in the page itself, so the page may stop responding until they finish and
they cannot be cancelled once started; a very long run asks you to confirm first. The report then shows the percentile summary, the
chart of the spread, which inputs matter (tornado, Spearman and, if switched on, Sobol), the seed and the
iteration count, and the probabilistic cleanup levels. A panel with no distribution set is skipped with a
note saying why. Results are not saved with the project.

For a modeled cleanup source the report does not run the analysis. It prints the result of the run you made on
the cleanup screen in this session (levels table, iterations, seed, warnings and which inputs matter), or says
the result is out of date because an input changed since the run and asks you to run it again there, or says no
run has been made yet. That result is not saved with the project or the browser's copy, so after a reload, a new
project or an opened project, run it again on the cleanup screen. Leaving to the report and coming back keeps it.
If you remove every chemical from the cleanup list after a run, the report says that result is out of date.
With several cleanup chemicals the report prints one such block per chemical, each current, out of date or "no run
yet" on its own.

The household, vapor and surface water source level panels of the cleanup screen print in the report's cleanup
section when their run has been sent here, each as a table of the same rows as the panel (method ids, source,
unit, source level, limiting endpoint, cancer and noncancer levels; the surface water table also gives the
surface water level it reproduces and whether each level is linear or solved, with the solve detail). A level that
is not quantified prints as an empty cell with its reason in the
last column, never as zero. The report solves the surface water levels that are not linear
before it prints them. The three tables also have Download CSV buttons on the cleanup screen.

### Validation (`#/validation`)

This page shows the published worked examples the test suite reproduces: the source, the method, what is
compared, the number of cases, the tolerance and the status. A status is reproduced, named exception,
pending or deferred, or smoke test only. Below the table is a plain list of what is not verified: references a
method relies on that have not been read, defaults that carry a warning, and values the tests do not check.
There is no RISC5 licence, so nothing is checked against RISC5 outputs. The page is generated from the test
fixtures, so it matches what the tests check. It is linked from Methods and References, the home page and the
report's methods statement.

### Downloading tables

Result tables have a Download CSV button. The file name carries the table name, the app version, the data
editions it used and the date, so a file can be traced to what produced it.

## Documentation and sources

- This reader (`#/docs`) shows this guide, every methods note and the attributions.
- Methods and References (`#/methods`) lists every registered method with its kind, assumptions and sources.
- Validation (`#/validation`) lists the published examples the tests reproduce and what is unverified.
- The attributions document records the science and the data provenance. Third-party software licences are
  kept in a separate document in the repository.

## Reporting a problem

Open an issue on the project's repository:
[github.com/bmills23/model_flow/issues](https://github.com/bmills23/model_flow/issues). Please describe what
you entered and attach the saved project file if you can; it holds your inputs and nothing else.

### Results sent between screens carry their chemical

A result you send from a screen (the receptor well, the groundwater run for cleanup levels or for surface water,
the vadose and saturated sources, the water table, vadose and saturated sources for vapor intrusion, and a surface
water run) remembers the chemical the screen was set to. Exposure and risk and
cleanup levels check it against each row: a row with no result of its own chemical shows an error naming both
chemicals instead of taking another chemical's value, and the row for the matching chemical keeps it. Modeled
cleanup refuses a groundwater, vadose or saturated run for another chemical. A result sent from a screen with the
chemical typed by hand carries no chemical: it is still used when the run holds one chemical, and when the run
holds two or more the row says to choose the chemical on the sending screen and send it again. A surface water run
linked to a groundwater run takes that run's chemical, shown read-only, and shows an error (and sends nothing) when
that chemical is not in the project list or the run held is for another chemical than the one set; an unlinked one takes the chemical you pick in the
"Chemical" list on the surface water screen (the project's chemical list), and carries none while that reads "Not
set", in which case a run of two or more chemicals refuses it. While the project list is empty, the surface water
screen shows a link to the chemicals screen in place of the list. A chemical chosen earlier that has since been
removed from the project list stays chosen, marked as not in the list.

Each chemical keeps its own sent result. Sending toluene from a screen leaves the benzene result it sent before
in place, so run a screen once per chemical and send each result: exposure and risk and cleanup levels then find a
result for each row, and each row, panel and screen reads the result of its own chemical. Sending again for the
same chemical replaces only that chemical's result. A result from a file saved before this change was given the
chemical its sending screen was set to when it opened (see the project section above).

The screens that read such a result as their own input make the same check against the chemical they are set to:
the household screen for the receptor well and surface water series, the vapor screen for the water table, vadose
and saturated sources, and groundwater transport for the vadose and saturated sources. A result for another
chemical is not offered and shows an error naming both chemicals; nothing is computed or sent from it. A result
without a recorded chemical is used while the project holds one chemical, and refused when it holds two or more,
and a screen whose chemical you typed by hand takes any result.
