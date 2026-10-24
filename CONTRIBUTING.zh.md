# 贡献指南

[English](./CONTRIBUTING.md) | 中文

感谢贡献 `env-safe`。

## 开发环境

```bash
npm install
npm test
npm run lint
npm run ci
```

## Pull Request 检查清单

- 行为变化必须新增或更新测试。
- README 示例需要与 CLI 行为保持一致。
- 中文文档更新时同步更新 `docs/configuration.zh.md`。
- 用户可见变化需要更新 `CHANGELOG.md` 和 `CHANGELOG.zh.md`。
- 提交前运行 `npm run ci`。

## 代码风格

- 使用 CommonJS，保持 CLI 零构建运行。
- 优先使用小型纯函数。
- CLI 输出需要稳定，便于脚本读取。
- 不引入运行时依赖，除非 README 明确说明原因。
