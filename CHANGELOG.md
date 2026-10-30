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
- Transistor parts: 2N3904 (NPN), 2N3906 (PNP), 2N7000 (n-channel MOSFET) and BS250 (p-channel MOSFET, all values estimated), with schematic symbols, TO-92 footprints and 3D packages marked with the part number.
- Playwright end-to-end test of the Phase 1 acceptance scenario in English and French, checking the warning and fail appear within 100 ms.
- CI builds the WebAssembly solver (with a `wasm-bindgen` CLI matching `Cargo.lock`), runs the end-to-end tests and runs the golden circuits against ngspice.

### Changed

- The "Try a swap" demo moved from the hero to its own section below it.
- New parts land on the board where their footprint clears every placed part, the board edge and the mounting holes, instead of on a fixed grid.
- Readouts show leftover leakage below a picoamp as zero, and unitless values such as current gain without an SI prefix.
- Token font stacks now read `--font-*` variables first, so the app can supply self-hosted fonts.
