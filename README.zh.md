# env-safe

[English](./README.md) | 中文

[![CI](https://github.com/zjh1880/env-safe/actions/workflows/ci.yml/badge.svg)](https://github.com/zjh1880/env-safe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)

`env-safe` 会在测试、构建或部署前校验运行时的 `.env` 文件是否与已提交的 `.env.example` 保持一致。

它可以提前发现这些常见部署问题：

- 缺少必需变量
- `.env` 中存在 `.env.example` 未声明的变量
- 必需变量为空
- dotenv 文件格式错误
- secret 仍使用 `replace-me`、`dummy` 等 placeholder
- secret 太短或为空
- `.env.example` 中不小心写入真实值

`env-safe` 是零运行时依赖的 Node.js CLI，不需要 API Key，不需要云服务，也不需要构建步骤。

## 安装

```bash
npm install -g env-safe
```

也可以不全局安装：

```bash
npx env-safe check --example .env.example --env .env
```

## 快速开始

创建模板文件：

```env
# .env.example
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app
JWT_SECRET=replace-me
PUBLIC_API_URL=https://api.example.com
OPTIONAL_FEATURE_FLAG=false
```

创建运行时文件：

```env
# .env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:password@localhost:5432/app
JWT_SECRET=local-dev-secret
PUBLIC_API_URL=https://api.example.com
OPTIONAL_FEATURE_FLAG=true
```

运行校验：

```bash
env-safe check --example .env.example --env .env
```

期望输出：

```text
env-safe: all checks passed
```

## 命令

### `check`

校验 `.env` 是否匹配 `.env.example`。

```bash
env-safe check --example .env.example --env .env
```

选项：

| 选项 | 默认值 | 说明 |
|---|---:|---|
| `--example <path>` | `.env.example` | 模板文件路径。 |
| `--env <path>` | `.env` | 运行时环境变量文件路径。 |
| `--format <text|json>` | `text` | 输出格式。 |
| `--strict` | `false` | 将 warning 视为失败。 |
| `--allow-extra` | `false` | 允许 `.env` 中存在未声明变量。 |
| `--secret-keys <key,key>` | none | 逗号分隔的 secret 字段列表。 |
| `--min-secret-length <n>` | `8` | secret 最小长度。 |
| `--help`、`-h` | — | 把用法打印到 stdout 并以 `0` 退出。不带命令时同样输出用法。 |

退出码：

| 退出码 | 含义 |
|---:|---|
| `0` | 没有错误。未使用 `--strict` 时可能有 warning。 |
| `1` | 发现一个或多个错误。 |
| `2` | 参数错误或文件不可读。 |

### `report`

输出紧凑校验摘要，适合 CI 日志或仪表盘。

```bash
env-safe report --example .env.example --env .env --secret-keys JWT_SECRET
```

示例输出：

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

显示 `.env.example` 与 `.env` 的可读差异。

```bash
env-safe diff --example .env.example --env .env
```

## JSON 输出

```bash
env-safe check --example examples/.env.example --env examples/.env.missing --format json
```

真实输出（路径按你在命令行里写的原样回显，不会变成绝对路径）：

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

顶层字段固定为 `ok`、`errors`、`warnings`、`summary`、`secretKeys`，外加 `example` / `env` 两份摘要（键名、可选键、你传入的路径）。

## 可选变量

在 `.env.example` 中给变量名前加 `?`：

```env
?OPTIONAL_ANALYTICS_KEY=
```

可选变量不要求出现在 `.env` 中。如果它出现，仍会校验格式和空值。

## Secret 校验

使用 `--secret-keys` 指定必须真实存在的 secret：

```bash
env-safe check --example .env.example --env .env --secret-keys JWT_SECRET,DATABASE_URL --min-secret-length 12
```

以下情况会失败：

- secret 缺失
- secret 为空
- secret 短于 `--min-secret-length`
- secret 仍是 `replace-me`、`dummy` 等 placeholder

## GitHub Actions 示例

```yaml
- name: Validate environment file
  run: npx env-safe check --example .env.example --env .env --strict --secret-keys JWT_SECRET
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
    JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

## 示例文件

```text
examples/
  .env.example
  .env.valid
  .env.missing
  .env.extra
  .env.secret
  .env.placeholder-secret
```

运行示例：

```bash
env-safe check --example examples/.env.example --env examples/.env.valid
env-safe report --example examples/.env.example --env examples/.env.secret --secret-keys JWT_SECRET
```

## 浏览器版

`web/` 目录是同一个体检站的纯前端版本：零依赖、零构建、离线可用。

打开方式：

```bash
# 方式一：直接打开文件
web/index.html

# 方式二：起一个静态服务（演示全屏、测试文件上传时更方便）
cd web && python -m http.server 8080   # 然后访问 http://127.0.0.1:8080/
```

它能做什么：

- 粘贴或拖拽 `.env.example` 与 `.env`，也可以上传文件
- 九类规则 + 0—100 健康分，error / warning / info 三级
- 每条问题都写清「现象 / 为什么危险 / 怎么改 / 怎么验」
- 导出 Markdown 或 JSON 报告；导出内容不包含变量值原文
- 示例数据、严重程度筛选、`Ctrl + Enter` 重跑、390px 起自适应

页面不加载任何 CDN、字体或统计脚本。它的 `<meta http-equiv="Content-Security-Policy">`（`default-src 'none'; connect-src 'none'`）让「不联网」从口头承诺变成浏览器强制执行。

浏览器端的规则集是 CLI 规则集的**超集**：额外检查连接串弱口令、未加引号的空格、小写键名，并按键名自动识别密钥字段；CLI 端则另有 `--strict` 与 `--allow-extra`。两者是两套实现，不是同一份内核。

设计说明用的截图放在仓库外的 `../数媒参赛材料/08_作品截图`，没有复制进仓库；本地跑一下应用即可看到同样的界面。

## 开发

```bash
npm install
npm test
npm run lint
npm run ci
```

如果环境禁止子进程管道（`spawn EPERM`），可以直接运行各套测试：

```bash
node tests/env-safe.test.js
node web/tests/engine.test.js
node web/tests/app.test.js
node web/tests/markup.test.js
```

本项目刻意不引入运行时依赖。

## 项目结构

```text
env-safe/
  src/env-safe.js              # CLI 实现
  tests/env-safe.test.js       # CLI 测试（node:test）
  examples/                    # 示例 env 文件
  docs/configuration.md        # 配置详解
  docs/configuration.zh.md
  web/                         # 浏览器版：零构建、零依赖
    index.html
    css/style.css
    js/engine.js               # 校验引擎（浏览器 / Node 通用）
    js/app.js                  # 界面逻辑
    tests/engine.test.js
    tests/app.test.js          # 桩 DOM 下的界面行为测试
    tests/markup.test.js       # HTML/CSS 契约（CSP、可访问性、版本号）
    README.md
  SECURITY.md / SECURITY.zh.md
  CODE_OF_CONDUCT.md / CODE_OF_CONDUCT.zh.md
  CONTRIBUTING.md / CONTRIBUTING.zh.md
  .github/workflows/ci.yml
  .github/PULL_REQUEST_TEMPLATE.md
```

## 路线图

- [ ] 支持 dotenv 变量展开：`API_URL=${BASE_URL}/v1`。
- [ ] 支持 `.env.local` 忽略规则。
- [ ] 增加 VS Code 扩展。
- [ ] 增加 GitHub App Pull Request checks。

## License

MIT
