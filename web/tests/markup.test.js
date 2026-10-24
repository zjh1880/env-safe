'use strict';

/**
 * Static contracts for the browser app: the things that cannot be checked by
 * calling a function — the CSP meta tag, accessibility attributes, the version
 * string, and the colour tokens. Reading the files is enough; no browser needed.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEB_DIR = path.join(__dirname, '..');
const REPO_DIR = path.join(WEB_DIR, '..');

const html = fs.readFileSync(path.join(WEB_DIR, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(WEB_DIR, 'css', 'style.css'), 'utf8');
const engineSource = fs.readFileSync(path.join(WEB_DIR, 'js', 'engine.js'), 'utf8');
const appSource = fs.readFileSync(path.join(WEB_DIR, 'js', 'app.js'), 'utf8');
const webReadme = fs.readFileSync(path.join(WEB_DIR, 'README.md'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_DIR, 'package.json'), 'utf8'));

test('页面带有可执行的 CSP，且不联网承诺可被强制 (B14)', () => {
  const match = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  assert.ok(match, 'missing Content-Security-Policy meta tag');

  const directives = match[1]
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

  assert.ok(directives.includes("default-src 'none'"), 'default-src must be none');
  assert.ok(directives.includes("script-src 'self'"), 'script-src must be self');
  assert.ok(directives.includes("style-src 'self' 'unsafe-inline'"), 'style-src must allow self + inline styles');
  assert.ok(directives.includes('img-src data:'), 'img-src must allow data: URIs (favicon)');
  assert.ok(directives.includes("connect-src 'none'"), 'connect-src must be none');
});

test('CSP 不会被内联脚本或内联事件处理器绕过', () => {
  const scriptTags = html.match(/<script\b[^>]*>/gi) || [];
  assert.ok(scriptTags.length > 0);
  scriptTags.forEach((tag) => {
    assert.match(tag, /\bsrc=/, `inline <script> would be blocked by script-src 'self': ${tag}`);
  });

  assert.doesNotMatch(html, /\son(?:click|load|error|change|input|submit|keydown|keyup|focus|blur)\s*=/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('页面不引用任何外部资源', () => {
  const remoteAttributes = html.match(/\b(?:src|href)\s*=\s*["'](?:https?:)?\/\//gi) || [];
  assert.deepEqual(remoteAttributes, []);

  assert.doesNotMatch(html, /<link[^>]+href="https?:/i);
  assert.doesNotMatch(css, /@import\s+(?:url\()?["']?https?:/i);
});

test('浏览器端代码里没有网络或 eval 调用', () => {
  [engineSource, appSource].forEach((source) => {
    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /XMLHttpRequest/);
    assert.doesNotMatch(source, /WebSocket/);
    assert.doesNotMatch(source, /sendBeacon/);
    assert.doesNotMatch(source, /\beval\s*\(/);
    assert.doesNotMatch(source, /new Function/);
  });

  // 经典脚本（不是 module）：module 脚本在 file:// 下会被 CORS 拦掉
  assert.doesNotMatch(html, /type="module"/);
  assert.doesNotMatch(html, /<base\b/i);
});

test('跳转链接有可聚焦的目标 (B12)', () => {
  assert.match(html, /<a class="skip" href="#workspace"/);
  assert.match(html, /id="workspace"[^>]*tabindex="-1"/);
});

test('两个上传按钮有各自的可访问名称 (B12)', () => {
  const buttons = html.match(/<button\b[^>]*data-upload="[^"]+"[^>]*>/gi) || [];
  assert.equal(buttons.length, 2);

  const labels = buttons.map((tag) => {
    const match = tag.match(/aria-label="([^"]+)"/);
    assert.ok(match, `upload button needs an aria-label: ${tag}`);
    return match[1];
  });

  assert.notEqual(labels[0], labels[1]);
});

test('筛选按钮带有 aria-pressed，且只有"全部"初始选中 (B12)', () => {
  const chips = html.match(/<button\b[^>]*class="chip[^"]*"[^>]*>/gi) || [];
  assert.equal(chips.length, 4);

  chips.forEach((tag) => {
    assert.match(tag, /aria-pressed="(?:true|false)"/, `chip missing aria-pressed: ${tag}`);
  });

  const pressed = chips.filter((tag) => /aria-pressed="true"/.test(tag));
  assert.equal(pressed.length, 1);
  assert.match(pressed[0], /data-filter="all"/);
});

test('aria-live 只挂在简短状态行上，而不是整个报告区 (B12)', () => {
  const reportTag = html.match(/<section id="report"[^>]*>/i);
  assert.ok(reportTag);
  assert.doesNotMatch(reportTag[0], /aria-live/);

  assert.match(html, /<p id="reportStatus"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(css, /\.sr-only\s*\{/);
});

test('页脚版本号与 package.json 一致 (B13)', () => {
  assert.match(html, new RegExp('v' + pkg.version.replace(/\./g, '\\.')));
  assert.doesNotMatch(html, /v1\.0\s*·/);
});

test('弱化文字与 placeholder 的对比度达到 AA (B12)', () => {
  assert.match(css, /--muted:\s*#5A6672/i);
  assert.match(css, /textarea::placeholder\s*\{\s*color:\s*#66737F/i);

  // 旧值不达标，不能被悄悄改回去
  assert.doesNotMatch(css, /--muted:\s*#66737F/i);
  assert.doesNotMatch(css, /textarea::placeholder\s*\{\s*color:\s*#9AA4AE/i);
});

test('不再声称浏览器端与 CLI 共用同一套规则 (C1)', () => {
  [html, engineSource, webReadme].forEach((text) => {
    assert.doesNotMatch(text, /共用同一套规则/);
    assert.doesNotMatch(text, /校验规则与[^。]*同源/);
    assert.doesNotMatch(text, /规则来自 env-safe CLI 的校验内核/);
  });

  // 正确的说法是"超集"，并点明各自多出什么
  assert.match(html, /超集/);
  assert.match(html, /--strict/);
  assert.match(html, /--allow-extra/);
  assert.match(engineSource, /超集/);
  assert.match(webReadme, /超集/);
});
