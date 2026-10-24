# 配置指南

[English](./configuration.md) | 中文

`env-safe` 会用运行时的 `.env` 文件校验已提交的 `.env.example` 模板。

## 默认文件

默认命令：

```bash
env-safe check
```

等价于：

```bash
env-safe check --example .env.example --env .env
```

## 指定文件路径

```bash
env-safe check --example config/env.template --env config/prod.env
```

## Strict 模式

```bash
env-safe check --strict
```

strict 模式会把 warning 视为失败。建议 CI 中使用 strict 模式。

## 允许额外变量

如果团队允许 `.env` 中存在本地专用变量，可以使用：

```bash
env-safe check --allow-extra
```

## 文件语法

两个文件都支持同一套小型 dotenv 方言：

- `KEY=value`
- `export KEY=value`（开头的 `export ` 会被忽略）
- `?KEY=value` 表示可选变量
- `#` 可以单独成行注释，也可以出现在行尾；行尾注释必须是「空白 + #」且不在引号内。
  `PORT=3000 # 端口` 的值是 `3000`，而 `NOTE="a # b"` 会保留 `#`
- 值可以用单引号或双引号包裹，解析时会去掉引号

其余写法会被报告为格式错误，而不是悄悄忽略。

## Secret 校验

```bash
env-safe check --example .env.example --env .env --secret-keys JWT_SECRET,API_KEY --min-secret-length 12
```

secret 校验会在以下情况失败：

- secret 在 `.env.example` 中声明但 `.env` 里缺失
- secret 在两个文件里都不存在，却仍被 `--secret-keys` 列出
- secret 为空
- secret 短于 `--min-secret-length`
- secret 仍是 placeholder

在 `.env.example` 里用 `?` 标成可选的键不受「缺失」两类约束：即使同时出现在 `--secret-keys` 中，缺席也不算错误。

## Placeholder 策略

以下 `.env.example` 值被认为是安全 placeholder：

- 空值
- `<YOUR_SECRET>`
- `replace-me`
- `change-me`
- `example`
- `dummy`
- `todo`
- 以 `your_`、`example_`、`dummy_`、`todo_`、`replace` 开头的值
- 数字端口，例如 `3000`
- 布尔值，例如 `true` 或 `false`
- 本地或示例 URL，例如 `http://localhost`、`https://example.com`
- 任意协议指向 localhost / 127.0.0.1 的本地服务地址（可带也可不带账号密码）：
  `postgres://localhost/app`、`postgres://user:password@localhost/db`、
  `redis://:secret@127.0.0.1:6379`

## 推荐工作流

1. 提交 `.env.example`。
2. 将 `.env` 加入 `.gitignore`。
3. 在 CI 中运行 `env-safe check --strict`。
4. 通过部署平台注入真实 secret。
