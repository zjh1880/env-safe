# Change log

English | [中文](./CHANGELOG.zh.md)

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- `--help` / `-h` now prints usage on stdout and exits `0`; running with no command does the same instead of failing with "Command is required".
- `--format json` now serializes `variables` / `optional` as arrays and reports file paths exactly as given on the command line instead of leaking absolute local paths.
- A secret listed in `--secret-keys` that is absent from both files is now reported as `missing_secret`.
- A key marked optional with `?` no longer produces `missing_secret` when it is absent.
- The parser accepts a leading `export ` and strips a trailing `# comment` that sits outside quotes.
- Local service URLs without credentials (`postgres://localhost/app`) are recognized as placeholders.

### Changed

- Documented the `web/` browser app, its rule set (a superset of the CLI), and the JSON output shape.
- CI now runs on Node 18, 20, and 22.

### Added

- `SECURITY.md`, `CODE_OF_CONDUCT.md`, and a pull request template (each with a Chinese variant).

## [1.1.0] - 2026-06-11

### Added

- `report` command for compact CI summaries.
- `--secret-keys` validation for required secret variables.
- `--min-secret-length` validation for secret strength.
- JSON summaries with key, error, warning, and secret counts.

## [1.0.0] - 2026-06-11

### Added

- `check` command for validating `.env` files.
- `diff` command for comparing `.env.example` and `.env`.
- JSON output for CI integrations.
- Optional variable support with `?KEY=value`.
- Built-in Node.js tests.
- GitHub Actions CI workflow.
- Complete open-source project documentation.
