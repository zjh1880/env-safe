# Configuration guide

English | [中文](./configuration.zh.md)

`env-safe` validates a runtime environment file against a committed template.

## Required file

By default:

```bash
env-safe check
```

uses:

```text
.env.example
.env
```

Override paths with:

```bash
env-safe check --example config/env.template --env config/prod.env
```

## Strict mode

Warnings become failures in strict mode:

```bash
env-safe check --strict
```

Use strict mode in CI so accidental extra variables are caught before deploy.

## Allow extra variables

Some teams intentionally keep local-only variables in `.env`. Allow them with:

```bash
env-safe check --allow-extra
```

## File syntax

Both files accept the same small dotenv dialect:

- `KEY=value`
- `export KEY=value` (a leading `export ` is ignored)
- `?KEY=value` marks the key optional
- `#` starts a comment on its own line, or at the end of a line when it is
  preceded by whitespace and sits outside quotes: `PORT=3000 # the port`
  keeps `3000`, while `NOTE="a # b"` keeps the hash
- single or double quotes around a value; the quotes are stripped

Anything else is reported as a malformed line rather than silently ignored.

## Placeholder policy

The CLI warns when `.env.example` appears to contain a real-looking secret. Example values that are accepted as placeholders include:

- empty values
- `<YOUR_SECRET>`
- `replace-me`
- `change-me`
- `example`
- `dummy`
- `todo`
- values starting with `your_`, `example`, `dummy`, `todo`, or `replace`
- numeric ports such as `3000`
- booleans such as `true` or `false`
- local/example URLs such as `http://localhost` or `https://example.com`
- local service URLs on any scheme, with or without credentials:
  `postgres://localhost/app`, `postgres://user:password@localhost/db`,
  `redis://:secret@127.0.0.1:6379`

## Secret validation

Use `--secret-keys` for values that must be present, real, and long enough:

```bash
env-safe check --example .env.example --env .env --secret-keys JWT_SECRET,API_KEY --min-secret-length 12
```

Secret validation fails when a declared secret is:

- missing (declared in `.env.example` but absent from `.env`)
- missing from both files while still listed in `--secret-keys`
- empty
- shorter than `--min-secret-length`
- still using a placeholder such as `replace-me` or `dummy`

A key marked optional with `?` in `.env.example` is exempt from the "missing" cases: if it is absent, that is not an error, even when it is also listed in `--secret-keys`.

## Recommended workflow

1. Commit `.env.example`.
2. Add `.env` to `.gitignore`.
3. Run `env-safe check --strict` in CI.
4. Provide missing secrets through your deployment platform.
