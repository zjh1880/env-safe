'use strict';

/**
 * UI behaviour tests for web/js/app.js.
 *
 * There is no jsdom dependency (this project stays zero-dependency), so this
 * file ships a deliberately tiny DOM stub: just enough surface for app.js to
 * boot. The assertions are about *behaviour* — filter state staying in sync,
 * file inputs being reusable, crafted query strings not exploding — not about
 * real browser layout.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const engine = require('../js/engine.js');

const APP_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

const IDS = [
  'exampleInput', 'envInput', 'reportEmpty', 'reportBody', 'issueList', 'reportStatus',
  'exampleCount', 'envCount', 'secretKeys', 'minSecret', 'reportTitle', 'reportLede',
  'countAll', 'countError', 'countWarning', 'countInfo', 'reportStats', 'gaugeValue',
  'scoreValue', 'exportMd', 'exportJson', 'runCheck', 'loadSample', 'clearAll',
  'exampleFile', 'envFile'
];

function makeClassList() {
  const classes = new Set();
  return {
    add(name) { classes.add(name); },
    remove(name) { classes.delete(name); },
    contains(name) { return classes.has(name); },
    toggle(name, force) {
      const on = force === undefined ? !classes.has(name) : Boolean(force);
      if (on) classes.add(name);
      else classes.delete(name);
      return on;
    },
    values() { return [...classes]; }
  };
}

function makeElement(tag, attrs) {
  const element = {
    tagName: String(tag).toUpperCase(),
    attrs: Object.assign({}, attrs),
    listeners: {},
    children: [],
    style: {},
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    value: '',
    files: [],
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attrs, name) ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(type, handler) {
      (this.listeners[type] = this.listeners[type] || []).push(handler);
    },
    dispatch(type, extra) {
      const event = Object.assign({ type, target: this, preventDefault() {} }, extra || {});
      (this.listeners[type] || []).forEach((handler) => handler(event));
    },
    click() { this.dispatch('click'); },
    appendChild(child) { this.children.push(child); return child; },
    remove() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
  element.classList = makeClassList();
  return element;
}

function makeDocument() {
  const byId = new Map();
  IDS.forEach((id) => byId.set(id, makeElement('div', { id })));

  const chips = ['all', 'error', 'warning', 'info'].map((filter) => {
    const chip = makeElement('button', { 'data-filter': filter });
    const active = filter === 'all';
    if (active) chip.classList.add('is-active');
    chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    return chip;
  });

  const uploads = [
    makeElement('button', { 'data-upload': 'example' }),
    makeElement('button', { 'data-upload': 'env' })
  ];
  const panels = [
    makeElement('div', { 'data-drop': 'example' }),
    makeElement('div', { 'data-drop': 'env' })
  ];
  const body = makeElement('body');

  return {
    byId,
    chips,
    body,
    document: {
      getElementById(id) { return byId.get(id) || null; },
      querySelectorAll(selector) {
        if (selector === '.chip') return chips;
        if (selector === '[data-upload]') return uploads;
        if (selector === '.panel[data-drop]') return panels;
        return [];
      },
      querySelector() { return null; },
      createElement(tag) { return makeElement(tag); },
      addEventListener() {},
      body
    }
  };
}

function FakeFileReader() {
  this.result = null;
  this.onload = null;
}
FakeFileReader.prototype.readAsText = function readAsText(file) {
  this.result = file && file.content ? file.content : '';
  if (typeof this.onload === 'function') this.onload();
};

function FakeBlob(parts, options) {
  this.parts = parts;
  this.type = (options && options.type) || '';
}

function loadApp(search) {
  const dom = makeDocument();
  const downloads = [];

  const sandbox = {
    window: { location: { search: search || '' }, EnvSafeEngine: engine },
    document: dom.document,
    performance: { now: () => 0 },
    // Never actually animate: tests read the final state, not the tween.
    requestAnimationFrame: () => 0,
    setTimeout: () => 0,
    FileReader: FakeFileReader,
    Blob: FakeBlob,
    URL: {
      createObjectURL(blob) { downloads.push(blob); return 'blob:stub'; },
      revokeObjectURL() {}
    },
    URLSearchParams,
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(APP_SOURCE, sandbox, { filename: 'app.js' });

  return { dom, el: (id) => dom.byId.get(id), downloads };
}

function activeChips(dom) {
  return dom.chips
    .filter((chip) => chip.classList.contains('is-active'))
    .map((chip) => chip.getAttribute('data-filter'));
}

test('默认示例会渲染报告并启用导出', () => {
  const { el } = loadApp('?still=1');

  assert.equal(el('reportEmpty').hidden, true);
  assert.equal(el('reportBody').hidden, false);
  assert.equal(el('reportTitle').textContent, '存在明显风险');
  assert.equal(el('scoreValue').textContent, '66');
  assert.equal(el('exportMd').disabled, false);
  assert.equal(el('exportJson').disabled, false);
  assert.equal(el('countAll').textContent, 4);
  assert.match(el('reportStatus').textContent, /体检完成/);
});

test('缺少模板时不评分、不导出，并给出明确标题 (B1)', () => {
  const { el } = loadApp('?still=1');

  el('exampleInput').value = '';
  el('envInput').value = '';
  el('runCheck').click();

  assert.equal(el('reportTitle').textContent, '无法体检：缺少模板');
  assert.equal(el('scoreValue').textContent, '—');
  assert.equal(el('exportMd').disabled, true);
  assert.equal(el('exportJson').disabled, true);
  assert.match(el('reportLede').textContent, /\.env\.example/);
  assert.match(el('reportStatus').textContent, /缺少/);
  assert.equal(el('countAll').textContent, '0');
});

test('筛选状态、按钮样式与 aria-pressed 始终同步 (B7)', () => {
  const { dom, el } = loadApp('?still=1');

  assert.deepEqual(activeChips(dom), ['all']);
  assert.equal(dom.chips[0].getAttribute('aria-pressed'), 'true');

  // 点击"警告"分类
  dom.chips[2].click();
  assert.deepEqual(activeChips(dom), ['warning']);
  assert.equal(dom.chips[2].getAttribute('aria-pressed'), 'true');
  assert.equal(dom.chips[0].getAttribute('aria-pressed'), 'false');
  assert.match(el('issueList').innerHTML, /issue-warning/);
  assert.doesNotMatch(el('issueList').innerHTML, /issue-error/);

  // 重新体检会把筛选重置为"全部"，按钮必须同步复位
  el('runCheck').click();
  assert.deepEqual(activeChips(dom), ['all']);
  assert.equal(dom.chips[0].getAttribute('aria-pressed'), 'true');
  assert.equal(dom.chips[2].getAttribute('aria-pressed'), 'false');
  assert.match(el('issueList').innerHTML, /issue-error/);
  assert.match(el('issueList').innerHTML, /issue-warning/);
});

test('重复选择同一个文件仍然生效 (B8)', () => {
  const { el } = loadApp('?still=1');

  el('exampleFile').value = 'C:\\fakepath\\same-name';
  el('exampleFile').files = [{ content: 'PORT=3000' }];
  el('exampleFile').dispatch('change');

  assert.equal(el('exampleInput').value, 'PORT=3000');
  assert.equal(el('exampleFile').value, '');

  // 同一个文件再来一次：如果 value 没被清空，浏览器不会再触发 change
  el('exampleFile').files = [{ content: 'PORT=8080' }];
  el('exampleFile').dispatch('change');

  assert.equal(el('exampleInput').value, 'PORT=8080');
});

test('被构造的 ?filter= 不会中断初始化 (B11)', () => {
  const crafted = loadApp('?still=1&filter=%22');
  assert.ok(crafted.el('reportTitle').textContent.length > 0);
  assert.deepEqual(activeChips(crafted.dom), ['all']);

  const bracket = loadApp('?still=1&filter=' + encodeURIComponent('"]'));
  assert.ok(bracket.el('reportTitle').textContent.length > 0);

  const valid = loadApp('?still=1&filter=error');
  assert.deepEqual(activeChips(valid.dom), ['error']);
  assert.equal(valid.el('countError').textContent, 2);
  assert.doesNotMatch(valid.el('issueList').innerHTML, /issue-warning/);
});

test('导出的报告不含变量值原文，并带提醒 (B4)', () => {
  const { el, downloads } = loadApp('?still=1');

  el('exampleInput').value = 'DATABASE_URL=postgres://user:password@localhost:5432/app';
  el('envInput').value = 'DATABASE_URL=postgres://app:hunter2@db.prod.internal:5432/main';
  el('runCheck').click();

  assert.doesNotMatch(el('issueList').innerHTML, /hunter2/);

  el('exportJson').click();
  el('exportMd').click();

  assert.equal(downloads.length, 2);

  const json = String(downloads[0].parts[0]);
  assert.doesNotMatch(json, /hunter2/);
  assert.ok(JSON.parse(json).notice.length > 0);

  const markdown = String(downloads[1].parts[0]);
  assert.doesNotMatch(markdown, /hunter2/);
  assert.ok(markdown.includes(engine.REPORT_NOTICE));
});

test('清空按钮会收起报告并禁用导出', () => {
  const { dom, el } = loadApp('?still=1');

  el('clearAll').click();

  assert.equal(el('reportBody').hidden, true);
  assert.equal(el('reportEmpty').hidden, false);
  assert.equal(el('exportMd').disabled, true);
  assert.equal(el('exportJson').disabled, true);
  assert.deepEqual(activeChips(dom), ['all']);
});
