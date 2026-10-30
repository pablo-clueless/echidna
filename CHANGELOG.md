# Changelog

All notable changes to Echidna are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Monorepo scaffold: pnpm workspaces with Turborepo, and a Cargo workspace for the Rust crates.
- `@echidna/ui-tokens`: colour palette, light and dark themes, typography with per-locale font fallbacks, spacing and radii, a WCAG contrast utility and generated CSS custom properties.
- Separate fill, label and text tokens for each status colour, so every status pairing meets WCAG AA in both themes.
- `@echidna/core`: shared types for specs with provenance, netlists, layout (devices, boards, layer stacks, slots and rails), rule violations and projects.
- `echidna-solver` and `echidna-solver-wasm` crate stubs.
- `echidna-api` service stub with a `/health` endpoint.
- README.
- `@echidna/web`: Next.js 16 App Router app with localised routes for English, French, Spanish, Chinese, Japanese and Russian, falling back to English for missing strings.
- Compact language menu and a sun / moon theme toggle, built with shadcn/ui. The theme follows the system until toggled, is remembered per user and applies before first paint.
- Tailwind CSS v4 and shadcn/ui, themed from the Echidna design tokens.
- Studio at `/[locale]/studio`: top bar (project, preset, Learn mode, Simulate), collapsible component library, 3D board view, and a resizable schematic / inspector column clamped to 20–80%.
- Validator drawer: a slim "All checks passed" bar when clean, a peek of the two worst issues with counts, and an expandable full list. Selecting an issue selects its component, and estimate-based fails read "Likely to fail".
- Panel sizes, library collapse, drawer state and Learn mode are remembered per user.
- Home page: a live "Try a swap" demo (5 V supply, series resistor, LED) where changing the resistor recalculates the LED current, animates current flow and LED glow, and updates the pass / warn / fail verdict. Also sections on the three slot checks, the six device types and value provenance, with load and scroll animations that respect reduced motion.
- Studio panels use shadcn/ui building blocks: empty states, search input group, issue list items, severity badges and tooltips on icon buttons. The 3D grid follows the theme.
- Home hero: an isometric 3D development board that assembles itself in a loop. Nine parts (processor, memory, capacitors, resistors, USB-C, inductor, crystal, LED and pin header) drop into place one by one, each highlighted in orange with a label as it lands, then the board powers up, its traces glow and the LED lights before the parts lift away and it starts again. A panel under the board tracks which parts are placed. The animation pauses off screen and shows the finished, powered board when reduced motion is on.
- DM Sans and DM Mono, with Noto Sans fallbacks for Russian, Chinese and Japanese that load only on those locales. Latin and Cyrillic fonts are self-hosted, so they load even when Google Fonts is unreachable.
- Studio on phones: the 3D view fills the screen, and the component library, schematic and inspector open as bottom sheets from a tab bar. Learn mode and Simulate are kept to larger screens.
- ESLint for the whole repo: arrow functions everywhere except Next.js layouts, React Hooks and Next.js rules, imports sorted by line length, and a British English spelling check on user-facing text and English messages.
- Missing-translation report (`pnpm --filter @echidna/web i18n:report`), also written to the GitHub Actions job summary.
- GitHub Actions CI: lint, typecheck, tests, build and the translation report for the web app; formatting, Clippy and tests for the Rust crates.
- Rust toolchain pinned to 1.98.0.
- DC operating-point solver in Rust (modified nodal analysis with Newton–Raphson) for resistors, capacitors, inductors, sources, diodes and a behavioural linear regulator with dropout, compiled to WebAssembly and run in a Web Worker.
- Component library: ground, 5 V supply, 150 Ω resistor, 10 µF ceramic capacitor, red 5 mm LED and a 3.3 V LDO, each with a JSON Schema-checked spec and value provenance.
- Rule engine with default voltage, current and power rating rules: warn above 80 % of a rating, fail above 100 %, and mark verdicts as estimated when they rest on estimated values.
- Schematic editor: place parts by dragging or clicking, wire pin to pin, move, rotate (R), nudge with the arrow keys, delete, pan, zoom and double-click to fit. Parts are outlined by verdict, wires show their net voltage, and the drawing scales with its panel.
- Live simulation: every edit is solved and checked straight away, with the solve time in the validator. Simulate pauses and resumes it.
- Inspector: editable values in the user's locale (including `4k7`-style notation), provenance badges, live voltages, currents and power, rating meters with Learn mode explanations, and pre-checked swap suggestions. Selecting a wire shows its net.
- "Open the 3.3 V regulator example" on the empty schematic.
- 3D board: a 100 × 70 mm board with black solder mask, gold pads, solder joints, silkscreen designators and mounting holes, and generic parts sized from their packages: resistor colour bands follow the value, the regulator shows its output voltage and the LED glows with its simulated current. Parts drag with 0.5 mm snap, and selection and verdicts are outlined on the board.
- 3D camera toolbar: zoom, fit board, 3D and top views, with keyboard shortcuts (+, −, F, T, Home, arrow keys to pan) and smooth transitions. Fitting shows the whole board on tall screens such as phones.
- Through-hole parts sit in drilled, plated holes, with copper rings on both faces and solder joints on the underside. The holes move with the part.
- The 3D board is routed automatically: copper tracks follow the wiring on both layers at 45°, with tented vias where a track changes layer and wider tracks for supply and ground. The routing is a preview, not checked for manufacture.
- The 3D board has fiducials, a "REV A" legend with the project name, and a choice of black, green, blue or red solder mask, remembered per user.
- Underside view (B) in the 3D toolbar; the camera can now orbit beneath the board to the solder side.
- Collapsible component categories in the library, remembered per user and opened while searching.
- Golden DC circuits in `tools/golden`, compared against ngspice in CI to within 0.1 %.
- Solver models for NPN and PNP bipolar transistors (Ebers–Moll with Early effect) and n- and p-channel MOSFETs (SPICE level 1), with SPICE-style voltage limiting, and six transistor golden circuits.
- LEDs are one generic 5 mm part with a colour chosen in the inspector: red, yellow, green, blue or white, each with its own forward voltage. Saved projects with the old red LED open as a red LED.
- A lit LED glows in its own colour, with brightness that follows the simulated current, and goes dark when its circuit is open. An unlit LED's epoxy is a dark tint, so it no longer passes for lit.
- The inspector says whether a selected LED is lit, and when it is dark, why: a lead is unwired, both leads are on the same net, it is wired backwards, or the loop is not closed. A current rating with no current through it reads "No current flowing" instead of "Within rating".
- A slide switch (SPST, 0.5 A) with an on/off position chosen in the inspector; its schematic symbol and 3D actuator follow the position. The solver has a switch element for it: closed, it conducts through its 30 mΩ contact resistance; open, it is an ideal break and carries exactly no current. The example circuit now runs the supply through it, switched on, so the LED lights as soon as the example loads.
- The board can be resized from the inspector, from 40 × 30 mm to 200 × 200 mm. Parts left outside a smaller board move in to its edge, and the camera reframes the new outline.
- Transistor parts: 2N3904 (NPN), 2N3906 (PNP), 2N7000 (n-channel MOSFET) and BS250 (p-channel MOSFET, all values estimated), with schematic symbols, TO-92 footprints and 3D packages marked with the part number.
- Playwright end-to-end test of the Phase 1 acceptance scenario in English and French, checking the warning and fail appear within 100 ms.
- CI builds the WebAssembly solver (with a `wasm-bindgen` CLI matching `Cargo.lock`), runs the end-to-end tests and runs the golden circuits against ngspice.
- Transient analysis in the solver (`solveTransient` in WebAssembly): simulates a circuit from switch-on, with capacitors discharged and inductors carrying no current, in equal steps using backward Euler for the first and Gear 2 after. It returns node voltages, pin currents and power over time. Six golden transient circuits (RC charge, RL rise, ringing RLC, an LED switching on as a capacitor charges, a regulator feeding an RC filter, and an NPN turned on through a base RC delay) match ngspice within 1 %.
- "After switch-on" in the inspector: plots of the selected part's voltage and current from the moment the circuit is switched on. The run length is chosen automatically, from 10 µs up to 10 s, to frame the circuit settling, and is re-run on every edit in a separate worker after the verdicts are out. Pointing at the plots, or focusing them and using the arrow keys, replays switch-on on the 3D board, with LEDs glowing at the current of that moment. A circuit that stores no energy says it reaches its values at once, and one that cannot be simulated says so.
- Switch-on checks in the validator, configured in `rules.json` alongside the DC rules: voltage overshoot against a part's voltage rating, and current and heat against its ratings averaged over the worst millisecond, so a large capacitor that overloads a regulator or switch while it charges is flagged even though the settled circuit passes. Averaging ignores the instant, step-sized spike an ideal supply drives into a decoupling capacitor. They add warnings and fails only, after the DC verdicts.

### Changed

- The "Try a swap" demo moved from the hero to its own section below it.
- An unpowered linear regulator now turns off: its output disconnects and its bias current falls with the input, instead of forcing its full quiescent current through whatever feeds it (which drove the input of a regulator behind an open switch to about −500 kV).
- A regulator whose supply sags under a heavy load now settles in dropout instead of failing to converge. The solver moves it one mode at a time (regulating, dropout, off), so it no longer flips between regulating and off; this happened when a capacitor across an LED's resistor drew a large current at switch-on.
- Pins wired to different ground symbols are now joined by copper on the 3D board, as they already were in the simulation, so every wired pin of a part gets its track instead of only the one not going to ground.
- New parts land on the board where their footprint clears every placed part, the board edge and the mounting holes, instead of on a fixed grid.
- Readouts show leftover leakage below a picoamp as zero, and unitless values such as current gain without an SI prefix.
- Token font stacks now read `--font-*` variables first, so the app can supply self-hosted fonts.
