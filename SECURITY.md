# Security policy

English | [中文](./SECURITY.zh.md)

## Supported versions

| Version | Supported |
|---|---|
| `1.x` | Yes |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately through GitHub: go to the **Security** tab of this repository and choose **Report a vulnerability** (GitHub Security Advisories). If advisories are unavailable, open a minimal issue that only says you have a security report and asks a maintainer to open a private channel — leave out the details.

Useful reports include:

- a `.env` value that the tool prints back, exports, or logs in clear text;
- a rule that can be bypassed to make an unsafe configuration pass;
- a browser-app behaviour that sends configuration data anywhere;
- a crash or hang caused by a crafted `.env` file.

## What we consider in scope

- **Secret leakage in output.** Reports, JSON output, and CLI text must never echo variable values. A weak connection-string password must be described by length, never by value.
- **False passes.** A blank or unparseable template must not score as healthy.
- **False alarms that hide real problems.** A rule firing on legitimate values (ports, TTLs, durations) erodes trust and is treated as a bug.
- **Network access from the browser app.** The page ships a Content-Security-Policy with `default-src 'none'` and `connect-src 'none'`. Any code path that tries to reach the network is a defect.
- **Unsafe file handling** in the CLI (path traversal is not a concern — it only reads what you point it at — but unbounded reads or unexpected writes are).

## Out of scope

- The contents of the `.env` files you choose to paste into the browser app. Nothing is uploaded, but anything you copy into a public issue is public.
- Denial of service through a deliberately enormous file on your own machine.
- Vulnerabilities in Node.js itself, or in GitHub's hosting.

## What we will do

- Acknowledge the report as soon as we can, usually within a few days.
- Confirm impact, prepare a fix and a regression test, and credit you in the changelog unless you prefer otherwise.
- Publish a `CHANGELOG.md` entry once a fix is released.

## Handling secrets in your own setup

`env-safe` reads `.env` files; it never writes them. Keep `.env` in `.gitignore`, keep real values out of `.env.example`, and rotate anything that has ever been committed.
