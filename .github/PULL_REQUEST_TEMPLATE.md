## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Checklist

- [ ] `npm run ci` passes locally (`node tests/env-safe.test.js` and `node web/tests/*.test.js` if child-process pipes are blocked).
- [ ] Behaviour changes come with a regression test.
- [ ] `.env.example` values are still placeholders — no real keys, tokens, or passwords.
- [ ] `README.md` / `README.zh.md` (and `docs/`) are updated together when user-facing output changes.
- [ ] `CHANGELOG.md` and `CHANGELOG.zh.md` are updated for user-facing changes.
- [ ] No runtime dependencies were added.
- [ ] CLI output stays stable and script-friendly; JSON field names are unchanged unless this is a breaking change.
- [ ] Reports and logs never echo variable values.

## How to verify

<!-- Commands you ran and the output you expected. -->
