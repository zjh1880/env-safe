# Contributing

English | [中文](./CONTRIBUTING.zh.md)

Thank you for contributing to `env-safe`.

## Development setup

```bash
npm install
npm test
npm run lint
```

## Pull request checklist

- Add or update tests for behavior changes.
- Keep examples in sync with README changes.
- Update `CHANGELOG.md` for user-facing changes.
- Run `npm run ci` before opening a pull request.

## Code style

- Use CommonJS because the CLI has no build step.
- Prefer small pure functions in `src/env-safe.js`.
- Keep CLI output stable and script-friendly.
