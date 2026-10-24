/* EnvSafe 配置安全体检站 · 界面逻辑 */
(function () {
  'use strict';

  var engine = window.EnvSafeEngine;
  var $ = function (id) { return document.getElementById(id); };

  var SAMPLE_EXAMPLE = [
    '# .env.example —— 提交到仓库的模板，不要写真实密钥',
    'NODE_ENV=development',
    'PORT=3000',
    'DATABASE_URL=postgres://user:password@localhost:5432/app',
    'JWT_SECRET=replace-me',
    'REDIS_URL=',
    'PUBLIC_API_URL=https://api.example.com',
    '?SENTRY_DSN='
  ].join('\n');

  var SAMPLE_ENV = [
    '# 本地运行配置',
    'NODE_ENV=production',
    'PORT=3000',
    'DATABASE_URL=postgres://admin:123456@db.internal:5432/app',
    'JWT_SECRET=dev',
    'PUBLIC_API_URL=https://api.example.com',
    'DEBUG_MODE=true'
  ].join('\n');

  var CLEAN_EXAMPLE = [
    '# .env.example —— 提交到仓库的模板',
    'NODE_ENV=development',
    'PORT=3000',
    'DATABASE_URL=postgres://user:password@localhost:5432/app',
    'JWT_SECRET=replace-me',
    'PUBLIC_API_URL=https://api.example.com',
    '?SENTRY_DSN='
  ].join('\n');

  var CLEAN_ENV = [
    '# 本地运行配置',
    'NODE_ENV=production',
    'PORT=8080',
    'DATABASE_URL=postgres://app:Str0ng-Passw0rd@db.internal:5432/app',
    'JWT_SECRET=9f2c7a1e5b8d3c6f0a4e2d9b7c1f8a3e',
    'PUBLIC_API_URL=https://api.example.com'
  ].join('\n');

  var state = {
    result: null,
    filter: 'all',
    isSample: false
  };

  var params = new URLSearchParams(window.location.search);
  var STILL = params.get('still') === '1';
  if (STILL) document.body.classList.add('no-anim');

  var exampleInput = $('exampleInput');
  var envInput = $('envInput');
  var reportEmpty = $('reportEmpty');
  var reportBody = $('reportBody');
  var issueList = $('issueList');
  var reportStatus = $('reportStatus');

  /* ---------- 输入辅助 ---------- */

  function countLines(text) {
    if (!text) return 0;
    return text.split(/\r?\n/).length;
  }

  function updateCounts() {
    $('exampleCount').textContent = countLines(exampleInput.value) + ' 行';
    $('envCount').textContent = countLines(envInput.value) + ' 行';
  }

  function announce(text) {
    if (reportStatus) reportStatus.textContent = text;
  }

  function readFile(file, target) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      target.value = String(reader.result || '');
      updateCounts();
      runCheck(false);
    };
    reader.readAsText(file);
  }

  /* ---------- 体检与渲染 ---------- */

  function parseSecretKeys(value) {
    return String(value || '')
      .split(',')
      .map(function (item) { return item.trim(); })
      .filter(Boolean);
  }

  function runCheck(isSample) {
    var result = engine.check(exampleInput.value, envInput.value, {
      secretKeys: parseSecretKeys($('secretKeys').value),
      minSecretLength: Number($('minSecret').value) || 8
    });
    state.result = result;
    state.isSample = Boolean(isSample);
    setFilter('all');
    renderReport(result);
  }

  function scoreTone(score) {
    if (score >= 85) return { color: 'var(--teal)', title: '配置状态良好' };
    if (score >= 70) return { color: 'var(--amber)', title: '基本可用，仍有隐患' };
    if (score >= 45) return { color: 'var(--amber)', title: '存在明显风险' };
    return { color: 'var(--red)', title: '高风险配置' };
  }

  function renderReport(result) {
    reportEmpty.hidden = true;
    reportBody.hidden = false;

    if (result.status === 'no-template') {
      renderNoTemplate(result);
      return;
    }

    var tone = scoreTone(result.score);
    $('reportTitle').textContent = tone.title;
    var ledeParts = [];
    if (state.isSample) ledeParts.push('示例配置：');
    if (result.issues.length === 0) {
      ledeParts.push('没有发现问题，变量、空值与密钥都通过了检查。');
    } else {
      ledeParts.push('共发现 ' + result.issues.length + ' 个问题（错误 ' + result.summary.error +
        ' · 警告 ' + result.summary.warning + ' · 提示 ' + result.summary.info +
        '），修复错误与警告后预计 ' + result.projectedScore + ' 分。');
    }
    $('reportLede').textContent = ledeParts.join('');

    $('countAll').textContent = result.issues.length;
    $('countError').textContent = result.summary.error;
    $('countWarning').textContent = result.summary.warning;
    $('countInfo').textContent = result.summary.info;

    renderStats(result);
    renderIssues();

    var gauge = $('gaugeValue');
    var circumference = 326.7;
    gauge.style.stroke = tone.color;
    if (STILL) {
      gauge.style.transition = 'none';
      gauge.style.strokeDashoffset = String(circumference * (1 - result.score / 100));
      $('scoreValue').textContent = String(result.score);
    } else {
      gauge.style.strokeDashoffset = String(circumference);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          gauge.style.strokeDashoffset = String(circumference * (1 - result.score / 100));
        });
      });
      animateNumber($('scoreValue'), result.score);
    }

    $('exportMd').disabled = false;
    $('exportJson').disabled = false;

    announce('体检完成：健康分 ' + result.score + ' 分，共 ' + result.issues.length + ' 个问题。');
  }

  /* 没有模板时不能评分，也不能导出（B1） */
  function renderNoTemplate(result) {
    $('reportTitle').textContent = '无法体检：缺少模板';
    $('reportLede').textContent = '请先在左侧填入 .env.example（至少一行 KEY=value）。没有模板就没有可对照的变量清单，评分没有意义。';

    $('countAll').textContent = '0';
    $('countError').textContent = '0';
    $('countWarning').textContent = '0';
    $('countInfo').textContent = '0';

    renderStats(result);

    issueList.innerHTML = '<div class="empty-good"><h3>还没有可对照的模板</h3>' +
      '<p>.env.example 是体检的基准。填入模板后点「开始体检」，这里才会给出评分与问题清单。</p></div>';

    var gauge = $('gaugeValue');
    gauge.style.transition = 'none';
    gauge.style.stroke = 'var(--muted)';
    gauge.style.strokeDashoffset = '326.7';
    $('scoreValue').textContent = '—';

    $('exportMd').disabled = true;
    $('exportJson').disabled = true;

    announce('无法体检：缺少 .env.example 模板。');
  }

  function renderStats(result) {
    var stats = result.stats;
    $('reportStats').innerHTML =
      '<span>模板变量 <b>' + stats.exampleKeys + '</b> 项</span>' +
      '<span>运行配置 <b>' + stats.runtimeKeys + '</b> 项</span>' +
      '<span>识别密钥 <b>' + stats.secrets + '</b> 项</span>' +
      '<span>解析失败 <b>' + stats.malformed + '</b> 行</span>' +
      '<span>重复定义 <b>' + stats.duplicates + '</b> 处</span>';
  }

  function animateNumber(el, target) {
    var start = 0;
    var duration = 650;
    var began = performance.now();
    function tick(now) {
      var progress = Math.min(1, (now - began) / duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = String(Math.round(start + (target - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var SEVERITY_LABEL = { error: '错误', warning: '警告', info: '提示' };
  var SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

  function renderIssues() {
    var result = state.result;
    if (!result) return;

    var issues = result.issues.slice().sort(function (a, b) {
      return (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) ||
        a.key.localeCompare(b.key);
    });

    if (state.filter !== 'all') {
      issues = issues.filter(function (issue) { return issue.severity === state.filter; });
    }

    if (result.issues.length === 0) {
      issueList.innerHTML = '<div class="empty-good"><span class="mark">✓</span>' +
        '<h3>这次体检没有发现问题</h3>' +
        '<p>变量齐全、密钥可用、格式正确。建议把这份配置加入提交前检查。</p></div>';
      return;
    }

    if (issues.length === 0) {
      issueList.innerHTML = '<div class="empty-good"><h3>这个分类下没有条目</h3>' +
        '<p>切换上方筛选查看其他问题。</p></div>';
      return;
    }

    var html = issues.map(function (issue, index) {
      var id = 'issue-' + index;
      return '<article class="issue issue-' + issue.severity + '" style="animation-delay:' + (index * 45) + 'ms">' +
        '<button type="button" class="issue-head" aria-expanded="false" aria-controls="' + id + '">' +
          '<span class="sev">' + SEVERITY_LABEL[issue.severity] + '</span>' +
          (issue.key ? '<code class="issue-key">' + escapeHtml(issue.key) + '</code>' : '<span class="issue-key">—</span>') +
          '<span class="issue-title">' + escapeHtml(issue.title) + '</span>' +
          '<span class="issue-loc">' + escapeHtml(issue.location || '') + '</span>' +
          '<span class="chev" aria-hidden="true">+</span>' +
        '</button>' +
        '<div class="issue-body" id="' + id + '" hidden>' +
          row('现象', issue.detail) +
          row('为什么危险', issue.why) +
          row('怎么改', issue.fix) +
          row('怎么验', issue.verify) +
        '</div>' +
      '</article>';
    }).join('');

    issueList.innerHTML = html;

    Array.prototype.forEach.call(issueList.querySelectorAll('.issue-head'), function (head) {
      head.addEventListener('click', function () {
        var expanded = head.getAttribute('aria-expanded') === 'true';
        head.setAttribute('aria-expanded', String(!expanded));
        var body = document.getElementById(head.getAttribute('aria-controls'));
        if (body) body.hidden = expanded;
      });
    });
  }

  function row(label, text) {
    if (!text) return '';
    return '<dl class="issue-row"><dt>' + label + '</dt><dd>' + escapeHtml(text) + '</dd></dl>';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ---------- 导出 ---------- */

  function download(filename, content, type) {
    var blob = new Blob([content], { type: type || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function timestamp() {
    var now = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' +
      pad(now.getHours()) + pad(now.getMinutes());
  }

  /* ---------- 筛选 ---------- */

  /* 唯一的筛选入口：状态、按钮样式与 aria-pressed 永远同步（B7） */
  function setFilter(filter) {
    state.filter = filter || 'all';
    Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
      var active = chip.getAttribute('data-filter') === state.filter;
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderIssues();
  }

  /* ---------- 事件 ---------- */

  $('runCheck').addEventListener('click', function () { runCheck(false); });
  $('loadSample').addEventListener('click', function () {
    exampleInput.value = SAMPLE_EXAMPLE;
    envInput.value = SAMPLE_ENV;
    updateCounts();
    runCheck(true);
  });
  $('clearAll').addEventListener('click', function () {
    exampleInput.value = '';
    envInput.value = '';
    updateCounts();
    state.result = null;
    reportBody.hidden = true;
    reportEmpty.hidden = false;
    $('exportMd').disabled = true;
    $('exportJson').disabled = true;
    setFilter('all');
    announce('已清空输入。');
  });

  $('exportMd').addEventListener('click', function () {
    if (!state.result || state.result.status === 'no-template') return;
    var markdown = engine.toMarkdown(state.result, { generatedAt: new Date().toLocaleString('zh-CN') });
    download('envsafe-report-' + timestamp() + '.md', markdown, 'text/markdown;charset=utf-8');
  });

  $('exportJson').addEventListener('click', function () {
    if (!state.result || state.result.status === 'no-template') return;
    var payload = {
      generatedAt: new Date().toISOString(),
      score: state.result.score,
      projectedScore: state.result.projectedScore,
      summary: state.result.summary,
      stats: state.result.stats,
      notice: engine.REPORT_NOTICE,
      issues: state.result.issues
    };
    download('envsafe-report-' + timestamp() + '.json', JSON.stringify(payload, null, 2), 'application/json;charset=utf-8');
  });

  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
    chip.addEventListener('click', function () {
      setFilter(chip.getAttribute('data-filter'));
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-upload]'), function (button) {
    button.addEventListener('click', function () {
      var which = button.getAttribute('data-upload');
      $(which + 'File').click();
    });
  });

  $('exampleFile').addEventListener('change', function (event) {
    readFile(event.target.files[0], exampleInput);
    // 允许再次选择同一个文件（B8）
    event.target.value = '';
  });
  $('envFile').addEventListener('change', function (event) {
    readFile(event.target.files[0], envInput);
    event.target.value = '';
  });

  Array.prototype.forEach.call(document.querySelectorAll('.panel[data-drop]'), function (panel) {
    var which = panel.getAttribute('data-drop');
    var target = which === 'example' ? exampleInput : envInput;

    ['dragenter', 'dragover'].forEach(function (name) {
      panel.addEventListener(name, function (event) {
        event.preventDefault();
        panel.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      panel.addEventListener(name, function (event) {
        event.preventDefault();
        panel.classList.remove('dragover');
      });
    });
    panel.addEventListener('drop', function (event) {
      var file = event.dataTransfer && event.dataTransfer.files[0];
      readFile(file, target);
    });
  });

  [exampleInput, envInput].forEach(function (input) {
    input.addEventListener('input', updateCounts);
  });

  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      runCheck(false);
    }
  });

  /* ---------- 初始化：载入示例并体检 ---------- */

  exampleInput.value = SAMPLE_EXAMPLE;
  envInput.value = SAMPLE_ENV;
  updateCounts();
  setFilter('all');

  if (params.get('clean') === '1') {
    exampleInput.value = CLEAN_EXAMPLE;
    envInput.value = CLEAN_ENV;
    updateCounts();
    runCheck(true);
  } else if (params.get('empty') === '1') {
    reportBody.hidden = true;
    reportEmpty.hidden = false;
    announce('尚未体检。');
  } else {
    runCheck(true);
    var filter = params.get('filter');
    if (filter) {
      // 不用拼接选择器，避免 ?filter=" 这类输入抛 SyntaxError（B11）
      var matched = null;
      Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (chip) {
        if (chip.getAttribute('data-filter') === filter) matched = chip;
      });
      if (matched) setFilter(filter);
    }
    if (params.get('expand') === '1') {
      var first = issueList.querySelector('.issue-head');
      if (first) first.click();
    }
  }
})();
