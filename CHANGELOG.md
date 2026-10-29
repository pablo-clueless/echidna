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
