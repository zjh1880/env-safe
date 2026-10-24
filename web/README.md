# EnvSafe 配置安全体检站（Web 版）

在浏览器本地检查 `.env` 与 `.env.example`：缺失变量、空值、占位符、弱密钥、重复键与格式错误。纯前端、零依赖、离线可用，配置内容不上传。

## 运行

方式一：双击 `index.html`，用 Chrome / Edge 打开即可。

方式二（推荐，便于演示全屏与文件上传）：

```bash
cd web
python -m http.server 8080
```

然后访问 http://127.0.0.1:8080/ 。

## 功能

- 粘贴或上传 `.env.example` 与 `.env`，支持拖拽。
- 九类检查：缺失必需变量、未声明变量、空值、占位符、短密钥、示例文件真实值、连接串弱口令、重复键与格式错误、空格与大小写。
- 0—100 健康分，error / warning / info 三级分类。
- 每条问题给出「现象 / 为什么危险 / 怎么改 / 怎么验」。
- 一键导出 Markdown 或 JSON 体检报告；导出内容不含变量值原文。
- 示例数据、按严重程度筛选、键盘 `Ctrl + Enter` 执行。
- 390px 起自适应，手机浏览器可直接使用。

## 结构

```
web/
  index.html
  css/style.css
  js/engine.js      校验引擎（浏览器 / Node 通用）
  js/app.js         界面逻辑
  tests/engine.test.js
  tests/app.test.js     桩 DOM 下的界面行为测试
  tests/markup.test.js  HTML/CSS 契约（CSP、可访问性、版本号）
```

## 规则集与 CLI 的关系

浏览器端规则集是 CLI（仓库根目录的 `env-safe`）的**超集**，两者是两套独立实现：

- 浏览器端额外做：连接串弱口令（含无用户名的 `redis://:pw@host`）、值含空格未加引号、小写键名、按键名自动识别密钥字段。
- CLI 端额外做：`--strict`（warning 视为失败）、`--allow-extra`（允许未声明的额外变量）。

不要把两者描述成"共用同一套内核"——它们只是覆盖范围相近。

## 测试

```bash
cd web
node --test          # 或在受限环境里逐个跑下面的文件
node tests/engine.test.js
node tests/app.test.js
node tests/markup.test.js
```

## 隐私

页面不包含任何 `fetch` / `XMLHttpRequest` / `WebSocket` 调用，不加载外部 CDN、字体或统计脚本。输入内容只存在于当前标签页内存，关闭即清除。

`index.html` 里的 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src data:; connect-src 'none'">` 让这条承诺由浏览器强制执行：任何外连都会被拦截。

导出的 Markdown / JSON 只包含键名与问题描述，不含变量值原文；报告末尾也带一行提醒。

## License

MIT
