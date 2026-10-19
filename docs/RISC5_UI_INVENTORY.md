# RISC5 user-facing feature inventory (paraphrased, from the Nov 2014 Users Guide)
Page column uses the manual's own page labels (chapter-page, FAQ-n, roman numerals). Not copied prose.
Columns: ID | Feature | What the user can do | Where in workflow | Page

## A. Project and file handling (6)
A1 | New project | Clear all user entries (with a cancel warning) while keeping defaults and database entries | Main screen button bar | 2-4
A2 | Save project | Save everything to a project file (suggested .prj extension); filename and last-saved time shown in the title bar | Main screen | 2-4
A3 | Save As | Re-save under the same or new name; silent overwrite if already saved this session | Main screen | 2-5
A4 | Open project | Load a saved project; warns that current entries are discarded; v4 files not compatible | Main screen | 2-5, FAQ-2
A5 | Exit | Quit, prompted to save; also available as window close from every screen | Main screen, all screens | 2-5
A6 | Default project folder | Projects default to a per-user Project Files folder; any location allowed | Save dialog | 2-3

## B. Navigation, help, options (6)
B1 | Six-step main menu | Six numbered step buttons; each step unlocks only after the previous is done | Main screen | 2-3
B2 | Context help | Help button on every screen opens topic help with hyperlinked terms | All screens | 2-5
B3 | Number format option | Options menu lets the user switch decimal separator to comma | Options menu on main screen | FAQ-2
B4 | Revisit earlier steps | Go back to change chemicals or choices; downstream data must be re-entered and models re-run | Steps 1-3 | 3-2
B5 | Edit/View Databases button | Opens the Master Database Editor; blocked while project data exists (offers to save first) | Bottom of main screen | 2-5, FAQ-6
B6 | Tutorials and FAQ | Separate downloadable step-by-step tutorials and a FAQ list | Front matter | FAQ-1

## C. Master Database Editor (permanent databases) (11)
C1 | Chemical properties editor | Browse chemicals, view and change default properties permanently | Master DB editor | FAQ-7
C2 | Add chemical | Add a new chemical by name and CAS; new entry is a copy of the currently viewed chemical for editing | Chemical DB editor | FAQ-8
C3 | Remove chemical | Delete chemicals from the permanent library | Chemical DB editor | 2-6
C4 | Per-property reference field | Each property has a reference text cell, with a larger text box to edit it | Chemical DB editor | FAQ-9
C5 | Summary table of all chemical data | Button builds a full table of the whole chemical database (spreadsheet) | Master DB editor | 10-1
C6 | Human receptor profiles | Add, remove, edit default exposure parameter profiles (deterministic) | Master DB editor | 2-6, FAQ-3
C7 | Monte Carlo receptor profiles | Separate database of exposure parameters for probabilistic runs (listed, not detailed in the guide) | Master DB editor | FAQ-3
C8 | Soil property profiles | Add, remove, edit soil types and default values (12 soil types gravel to clay shipped) | Master DB editor | 2-6, 5-3
C9 | Ecological receptor profiles | Add, remove, edit wildlife receptors and their exposure values | Master DB editor | 2-6
C10 | Restore original databases | Not a button: delete the database file and defaults regenerate on next launch | User directory | 2-6, FAQ-9
C11 | Databases kept apart from the install | User edits persist across software updates; four spreadsheet database files | User directory | 2-3

## D. Step 1: choose chemicals of concern (6)
D1 | Two-list chemical picker | Pick from the 128-chemical list into a selected list; deselect with a second button | Step 1 | 3-2
D2 | Selection limit | Up to 50 chemicals per analysis | Step 1 | 3-2
D3 | Project-level chemical data edit | Edit any chemical parameter for this project only (not the master DB) | Step 1 | 3-3
D4 | Synchronised edits | Change toxicity here or in Step 4c, fate parameters here or in Step 3c; same stored value shown everywhere | Steps 1, 3c, 4c | 3-3
D5 | Chemical summary table | Button produces a two-sheet table: values plus a references sheet | Step 1 lower right | 3-3
D6 | Per-property reference view | Chemical property references shown in the summary and editor | Step 1, DB editor | 3-3

## E. Step 2: conceptual site model (9)
E1 | Human vs ecological choice | First selection decides which pathway set follows | Step 2 top left | 4-2
E2 | Specify concentrations vs use models | Choose direct entry or fate and transport modelling | Step 2 top centre | 4-2
E3 | Source medium picker (direct) | One of five contaminated media when entering concentrations directly | Step 2 | 4-2
E4 | Source medium picker (modelled) | Soil (unsaturated), groundwater, soil to indoor air, soil gas to indoor air | Step 2 | 4-3
E5 | Exposure point location | Onsite or downgradient (not both in one scenario) | Step 2 | 4-3
E6 | Single source at a time | One source medium per analysis; rules for vapor source precedence (soil gas preferred) | Step 2 | 4-3, 4-4
E7 | Vegetable pathway source | Vegetables from soil or from irrigation groundwater, not both | Step 2 | 4-4
E8 | Indoor air model choice | Select among three vapor intrusion models | Step 2 | 4-4
E9 | Ecological setup screen | Guide says ecological setup in Step 2 is pending (not specified) | Step 2 | 4-4

## F. Step 3: receptor point concentrations (14)
F1 | Direct concentration entry | Type concentrations per chemical for soil ingestion, dermal, vegetable pathways (not used as model source) | Step 3 | 5-1
F2 | Four-sub-step model flow | 3a site properties, 3b source concentrations, 3c chemical parameters, 3d run and view | Step 3 | 5-2
F3 | Site properties form (3a) | Grouped input panels that change by model: source geometry, aquifer, unsaturated zone, lens | Step 3a | 5-2, 5-3
F4 | Soil type default dropdown | Pick a soil type to populate property defaults and ranges (e.g. loamy sand); editable after | Step 3a | 5-3
F5 | Source concentration entry (3b) | Concentrations in soil, groundwater or soil gas depending on model | Step 3b | 5-4
F6 | Include TPH checkbox | Per-chemical TPH concentration to compute effective solubility (mixture effect on leaching) | Step 3b | 5-4, 5-5
F7 | TPH fraction preserved in back-calc | Chemical share of TPH held fixed when clean-up levels scale | Step 3b / Step 5 | 5-5
F8 | Chemical-specific parameters (3c) | Review and override only the parameters the chosen models need, project-only | Step 3c | 5-5
F9 | Degradation rate edit | Media-specific degradation rate is the one chemical parameter edited in Step 3 | Step 3c | 10-4
F10 | Simulation time and time step | Enter total run time and step length | Step 3d | 5-6
F11 | Source pulse length | Duration the source is active, for the dissolved-phase groundwater model | Step 3d | 5-6
F12 | Steady-state notice | Indoor air non-depleting models are steady state, run time irrelevant | Step 3d | 5-6
F13 | Run model | Button runs the external model engine, then opens results in a spreadsheet | Step 3d | 5-5
F14 | Model list | Unsaturated zone, groundwater, saturated soil source, 3 vapor models, groundwater to indoor air, outdoor air box, shower, irrigation spray, particulate, surface water mixing | Step 3 | 1-3, 1-4

## G. Step 4: receptors and exposure (13)
G1 | Exposure pathway checklist (4a) | Choose which pathways apply; list depends on Step 2 choices | Step 4a | 6-2
G2 | Pathway set | Soil and sediment ingestion and dermal, drinking water ingestion, water dermal (shower, swimming), shower and irrigation inhalation, indoor and outdoor air inhalation, vegetable ingestion (soil or irrigated), surface water ingestion | Step 4a | 7-1 (list), 6-2
G3 | One or two receptors | Evaluate one or two receptors side by side | Step 4b | 6-4
G4 | Additive receptor option | Sum child plus adult exposures for cancer risk only; non-cancer reported separately | Step 4b | 6-4, 6-5
G5 | Receptor description labels | Free-text names for each receptor, carried into output tables | Step 4b | 6-5
G6 | Default receptor profiles | Dropdown loads typical or upper percentile (RME) exposure sets | Step 4b | 6-4
G7 | Exposure parameter edit | Edit each exposure value for the project | Step 4b | 6-3, 6-4
G8 | Changed-value highlight | Edited fields are tinted to show departure from profile; reselect profile to reset | Step 4b | 6-5
G9 | Chemical toxicity parameters (4c) | Review/override only toxicity values needed by chosen pathways, project-only | Step 4c | 6-5
G10 | Inhalation toxicity basis choice | Choose slope factor/reference dose or unit risk/reference concentration; unused pair grayed | Step 4 main | 6-5, 6-6
G11 | Back-calc note | With water-concentration targets, Step 4 values unused but steps still must be completed | Step 4 | 6-1
G12 | Seventeen pathways, two scenarios | Two exposure scenarios computed at once, e.g. residential and industrial | Step 4 | 1-5
G13 | Ecological receptor screen | Food web model exists but its interface is pending in this guide | Step 4 | 6-7

## H. Step 5: forward risk or clean-up levels (14)
H1 | Calculate risk vs clean-up levels | Choose forward risk or back calculation | Step 5 | 8-1
H2 | Individual vs cumulative targets | Option buttons; default is individual; cumulative sums across chemicals | Step 5 | 8-1, 8-3
H3 | Target cancer risk per chemical | Enter target excess cancer risk | Step 5 | 8-2
H4 | Target hazard quotient per chemical | Enter target HQ | Step 5 | 8-2
H5 | Target risk single boxes (cumulative) | One target risk and one target hazard for all | Step 5 | 8-3
H6 | Target water concentration (MCL) | Per-chemical MCL or surface water target replaces risk targets; ND value means use risk | Step 5 | 8-2, 8-5
H7 | Risk vs concentration toggle | Checkbox after chemical name switches between concentration and risk inputs | Step 5 | 8-3
H8 | Averaging time for target media | Input for the averaging period of the exposure concentration | Step 5 | 8-3
H9 | Surface water overrides groundwater | If both modelled, only surface water targets accepted | Step 5 | 8-1, 8-5
H10 | Single receptor for modelled back-calc | Transport scenarios allow one receptor (possibly additive) | Step 5 | 8-1
H11 | Deterministic only for clean-up | Back calc not available for probabilistic | Step 5 | 8-1
H12 | Start Simulation | Runs risk calc or iterative back calc; slower because models re-run until convergence | Step 5 | 8-4
H13 | Ratio-preserving scaling | Cumulative mode keeps original concentration ratios | Step 5 | 8-4
H14 | Combined carcinogen/noncarcinogen outcome | Meets both targets; lowest governing level reported | Step 5 results | 8-8, 8-9

## I. Step 6: results, tables, charts, reports (15)
I1 | Table type picker | Select Carcinogenic Risk, Hazard Index or Input/Output Summary, then View Table | Step 6 | 9-1
I2 | Carcinogenic risk table | Risk by chemical, pathway and receptor | Step 6 | 9-1
I3 | Hazard index table | Hazard quotients and totals | Step 6 | 9-1
I4 | Input/Output summary | One-page record of every input used and results | Step 6 | 9-1
I5 | Clean-up level results | Clean-up levels shown in Step 6 after a back calculation | Step 6 | 8-9
I6 | Spreadsheet-hosted output | Tables open directly in a spreadsheet so the user can format, print, paste into reports | Step 3d, Step 6 | 2-1, FAQ-3
I7 | Output menu (Risk Assessment / Fate and Transport) | Menu in the spreadsheet to switch result sets; reopenable from application menu | Step 6, Step 3d | 9-1, 9-2, 5-6
I8 | Model Input Summary | Table of all fate and transport inputs | Step 3d | 5-6
I9 | Chemical-specific model summaries | Intermediate calculations and results per chemical | Step 3d | 5-6
I10 | Per-medium concentration tables | One table per medium for quick review or write-up | Step 3d | 5-6
I11 | Concentration vs time charts | User-created plots of source and exposure medium concentrations over time | Step 3d | 5-5
I12 | Breakthrough curve check | View curves to judge whether run time was long enough | Step 3d | 5-6
I13 | Print or save tables, charts, figures | Done through the spreadsheet | Step 6 | 1-5
I14 | Surface water and sediment criteria comparison | Compare modelled concentrations against international aquatic and sediment criteria sets | Step 3d / results | 1-5, 1-4 (Appendices M, N)
I15 | Macro enablement | Result viewing requires enabling spreadsheet macros | Setup | 2-1, FAQ-4

## J. Chemical database content visible to user (8)
J1 | Physical-chemical property set | Solubility, Henry's constant, log Kow, Koc, Kd, air and water diffusion, degradation | DB editor, Step 1 | 10-1..10-4
J2 | Toxicity set | Carcinogen class, slope factors, reference doses, inhalation unit risk and RfC, absorption adjustment factors | DB editor, Step 4c | 10-5..10-7
J3 | Vegetable uptake factor | Soil-to-plant factors stored for some chemicals | DB editor | 10-4
J4 | Source citation per value | Every value carries a reference | DB editor | FAQ-9, 10-1
J5 | TPH fractions | Fraction entries as chemicals | Step 1 | 10-1
J6 | RfC/URF to dose conversion | Inhalation values converted automatically when needed | Step 4c | 10-7
J7 | Carcinogen weight-of-evidence class | Shown per chemical | DB editor | 10-5
J8 | Subchronic caution | Database holds chronic values; user edits RfD for short-term cases | Step 4c | 7-8

## Notes for gap analysis
- Not described in the guide: Monte Carlo UI (only the database is listed), ecological Step 2 and 4 screens, a built-in chart tool (charts are made in the spreadsheet), a native report generator.
- Guide pages are labelled as chapter-page; PDF page is roughly manual page + 24.
