# env-safe

English | [中文](./README.zh.md)

[![CI](https://github.com/zjh1880/env-safe/actions/workflows/ci.yml/badge.svg)](https://github.com/zjh1880/env-safe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

`env-safe` validates that your runtime `.env` file matches your committed `.env.example` before tests, builds, or deployments run.

It catches the boring-but-expensive mistakes that usually appear at deploy time:

- missing required variables
- extra variables not declared in `.env.example`
- empty required values
- malformed lines
- placeholder-looking values in real `.env`
- secrets that are empty, too short, or still using placeholders
- example files that accidentally contain real-looking secrets

`env-safe` is a zero-dependency Node.js CLI. No API key. No cloud account. No build step required.

## Install

```bash
npm install -g env-safe
```

Or run it without installing globally:

```bash
npx env-safe check --example .env.example --env .env
```

## Quick start

Create a template file:

```env
# .env.example
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app
JWT_SECRET=replace-me
PUBLIC_API_URL=https://api.example.com
OPTIONAL_FEATURE_FLAG=false
```

Create your local runtime file:

```env
# .env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app
JWT_SECRET=local-dev-secret
PUBLIC_API_URL=https://api.example.com
OPTIONAL_FEATURE_FLAG=true
```

Run validation:

```bash
env-safe check --example .env.example --env .env
```

Expected output:

```text
env-safe: all checks passed
```

## Commands

### `check`

Validate a runtime `.env` file against `.env.example`.

```bash
env-safe check --example .env.example --env .env
```

Options:

| Option | Default | Description |
|---|---:|---|
| `--example <path>` | `.env.example` | Template file to validate against. |
| `--env <path>` | `.env` | Runtime environment file to validate. |
| `--format <text\|json>` | `text` | Output format. |
| `--strict` | `false` | Treat warnings as failures. |
| `--allow-extra` | `false` | Allow variables in `.env` that are not present in `.env.example`. |
| `--secret-keys <key,key>` | none | Comma-separated keys that must be real, non-empty values. |
| `--min-secret-length <n>` | `8` | Minimum length for secret values. |
| `--help`, `-h` | — | Print usage to stdout and exit `0`. Also used when no command is given. |

Exit codes:

| Code | Meaning |
|---:|---|
| `0` | No errors. Warnings may exist unless `--strict` is used. |
| `1` | One or more validation errors were found. |
| `2` | Invalid arguments or unreadable files. |

### `report`

Print a compact validation summary for CI logs or dashboards.

```bash
env-safe report --example .env.example --env .env --secret-keys JWT_SECRET
```

Example output:

```text
env-safe report
status: ok
exampleKeys: 6
runtimeKeys: 6
errors: 0
warnings: 0
secrets: 1
```

### `diff`

Show a human-readable diff between `.env.example` and `.env`.

```bash
env-safe diff --example .env.example --env .env
```

## JSON output

Use JSON output when integrating with CI or another tool:

```bash
env-safe check --example examples/.env.example --env examples/.env.missing --format json
```

Real output (paths are echoed exactly as you typed them, never resolved to absolute local paths):

```json
{
  "ok": false,
  "errors": [
    {
      "code": "missing_required",
      "key": "DATABASE_URL",
      "message": "Required key DATABASE_URL is missing from .env"
    }
  ],
  "warnings": [],
  "summary": {
    "exampleKeys": 6,
    "runtimeKeys": 4,
    "errors": 1,
    "warnings": 0,
    "secrets": 0
  },
  "secretKeys": [],
  "example": {
    "path": "examples/.env.example",
    "keys": [
      "NODE_ENV",
      "PORT",
      "DATABASE_URL",
      "JWT_SECRET",
      "PUBLIC_API_URL",
      "OPTIONAL_FEATURE_FLAG"
    ],
    "optional": [
      "OPTIONAL_FEATURE_FLAG"
    ]
  },
  "env": {
    "path": "examples/.env.missing",
    "keys": [
      "NODE_ENV",
      "PORT",
      "JWT_SECRET",
      "PUBLIC_API_URL"
    ],
    "optional": []
  }
}
```

The top-level shape is stable: `ok`, `errors`, `warnings`, `summary`, `secretKeys`, plus an `example` / `env` summary of keys, optional keys, and the path you passed in.

## Optional variables

Prefix a key with `?` in `.env.example` to mark it optional:

```env
?OPTIONAL_ANALYTICS_KEY=
```

Optional variables are not required in `.env`. If present, they are still validated for empty values and malformed syntax.

## Secret validation

Use `--secret-keys` when a variable must exist, be non-empty, be longer than a minimum length, and not look like a placeholder:

```bash
env-safe check --example .env.example --env .env --secret-keys JWT_SECRET,DATABASE_URL --min-secret-length 12
```

This is useful for deployment checks where a secret might technically exist but still contain `replace-me`, `dummy`, or another placeholder value.

## GitHub Actions example

Add this to your CI workflow:

```yaml
- name: Validate environment file
  run: npx env-safe check --example .env.example --env .env --strict
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

## Why `.env.example` matters

A good `.env.example` file is executable documentation. It tells every developer and deployment target exactly which environment variables are required.

This project enforces that contract so your team does not discover missing configuration during a production deploy.

## Examples

See the `examples/` directory:

```text
examples/
  .env.example
  .env.valid
  .env.missing
  .env.extra
```

Run the examples:

```bash
env-safe check --example examples/.env.example --env examples/.env.valid
env-safe check --example examples/.env.example --env examples/.env.missing --format json
```

## Browser app

The `web/` directory contains a zero-dependency, offline-first version of the same checkup. It is a plain static page — no build step, no bundler, no server-side code.

Open it in one of two ways:

```bash
# 1. just open the file
web/index.html

# 2. or serve the folder (handy for full-screen demos and file uploads)
cd web && python -m http.server 8080   # then visit http://127.0.0.1:8080/
```

What it does:

- paste or drop `.env.example` and `.env`, or upload the files
- nine rule families with a 0–100 health score, split into error / warning / info
- every issue explains what happened, why it is dangerous, how to fix it, and how to verify the fix
- export the report as Markdown or JSON; exported reports never contain variable values
- sample data, severity filters, `Ctrl + Enter` to re-run, responsive down to 390px

The page loads no CDN, no fonts, and no analytics. Its `<meta http-equiv="Content-Security-Policy">` (`default-src 'none'; connect-src 'none'`) makes that "no network" promise enforceable by the browser rather than a claim you have to trust.

The browser ruleset is a **superset** of the CLI ruleset. It adds: connection-string weak-password checks, unquoted-whitespace checks, lowercase-key warnings, and automatic secret-name detection. The CLI adds `--strict` and `--allow-extra`. They are two implementations, not one shared core.

Screenshots used for the design write-up live outside this repository at `../数媒参赛材料/08_作品截图`. They are not copied into the repo; run the app locally to see the same screens.

## Development

```bash
npm install
npm test
npm run lint
```

Run the two suites directly if your environment blocks child-process pipes:

```bash
node tests/env-safe.test.js
node web/tests/engine.test.js
node web/tests/app.test.js
node web/tests/markup.test.js
```

This project intentionally has no runtime dependencies.

## Project structure

```text
env-safe/
  src/env-safe.js              # CLI implementation
  tests/env-safe.test.js       # CLI tests (node:test)
  examples/                    # Sample env files
  docs/configuration.md        # Detailed configuration guide
  docs/configuration.zh.md
  web/                         # Browser app: zero build, zero deps
    index.html
    css/style.css
    js/engine.js               # Validation engine (browser + Node)
    js/app.js                  # UI logic
    tests/engine.test.js
    tests/app.test.js          # UI behaviour under a stub DOM
    tests/markup.test.js       # HTML/CSS contracts (CSP, a11y, version)
    README.md
  SECURITY.md / SECURITY.zh.md
  CODE_OF_CONDUCT.md / CODE_OF_CONDUCT.zh.md
  CONTRIBUTING.md / CONTRIBUTING.zh.md
  .github/workflows/ci.yml
  .github/PULL_REQUEST_TEMPLATE.md
```

## Roadmap

- [ ] Support nested dotenv expansion: `API_URL=${BASE_URL}/v1`.
- [ ] Support `.env.local` ignore rules.
- [ ] Add a VS Code extension.
- [ ] Add GitHub App checks for pull requests.

## License

MIT
