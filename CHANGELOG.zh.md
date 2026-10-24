# 变更日志

[English](./CHANGELOG.md) | 中文

## [Unreleased]

### Fixed

- `--help` / `-h` 现在把用法打印到 stdout 并以 `0` 退出；不带命令时同样输出用法，而不是报「Command is required」。
- `--format json` 现在把 `variables` / `optional` 序列化为数组，并按命令行原样回显路径，不再泄露本机绝对路径。
- 只在 `--secret-keys` 中列出、两个文件都不存在的 secret，现在会被报告为 `missing_secret`。
- `.env.example` 中用 `?` 标成可选的键缺席时，不再报 `missing_secret`。
- 解析器支持开头的 `export `，并会去掉引号外以「空白 + #」开头的行尾注释。
- 不带账号密码的本地服务地址（如 `postgres://localhost/app`）现在被识别为占位符。

### Changed

- 文档补充了 `web/` 浏览器版、它与 CLI 的规则差异（超集关系），以及 JSON 输出的真实结构。
- CI 改为在 Node 18、20、22 上运行。

### Added

- 新增 `SECURITY.md`、`CODE_OF_CONDUCT.md` 与 Pull Request 模板（均含中文版本）。

## [1.1.0] - 2026-06-11

### Added

- 新增 `report` 命令，用于输出紧凑的 CI 摘要。
- 新增 `--secret-keys`，用于校验必需 secret。
- 新增 `--min-secret-length`，用于限制 secret 最小长度。
- JSON 输出新增 `summary` 统计信息。

## [1.0.0] - 2026-06-11

### Added

- 新增 `check` 命令，用于校验 `.env` 文件。
- 新增 `diff` 命令，用于比较 `.env.example` 与 `.env`。
- 新增 JSON 输出。
- 支持 `?KEY=value` 可选变量。
- 新增内置测试、GitHub Actions CI 和完整开源项目文档。
