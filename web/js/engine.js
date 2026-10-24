/*!
 * EnvSafe 配置安全体检站 · 校验引擎
 * 浏览器端规则是 CLI 版 env-safe 的超集：额外检查连接串弱口令、未加引号的空格、
 * 小写键名，并自动按键名识别密钥字段。CLI 版另有 --strict 与 --allow-extra。
 * 可在浏览器与 Node.js 中运行。
 * MIT License
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EnvSafeEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PLACEHOLDER_PATTERNS = [
    /^$/,
    /^<.+>$/,
    /^(replace[-_]?me|change[-_]?me|example|dummy|todo|placeholder|changeme|your[-_]?secret)$/i,
    /^(your_|example_|dummy_|todo_|replace[-_]?)/i,
    /^(dev|development|local|test|testing|prod|production|staging)$/i,
    /^https?:\/\/([^./]+\.)?example\.com/i,
    /^https?:\/\/(localhost|127\.0\.0\.1)/i,
    // 任意协议指向 localhost / 127.0.0.1（可带账号密码），例如 postgres://localhost/app
    /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?(?:localhost|127\.0\.0\.1)(?::[0-9]+)?(?:[/?#]|$)/i
  ];

  // 只在“最后一个下划线段”命中时才算密钥字段：
  // JWT_SECRET / API_KEY / DB_PASSWORD 命中；
  // TOKEN_TTL / SECRET_ROTATION_DAYS / ACCESS_KEY_ID 不命中。
  var SECRET_SEGMENTS = [
    'SECRET', 'SECRETS', 'TOKEN', 'PASSWORD', 'PASSWD', 'PASSPHRASE', 'KEY',
    'PRIVATEKEY', 'APIKEY', 'ACCESSKEY', 'AUTHKEY', 'CREDENTIAL', 'CREDENTIALS'
  ];

  var SEVERITY_WEIGHT = { error: 12, warning: 5, info: 1 };

  var WEAK_PASSWORDS = /^(password|passwd|123456|12345678|admin|root|secret|qwerty|letmein)$/i;

  var REPORT_NOTICE = '提示：本报告不会输出任何变量值的原文，粘贴到公开 Issue 前仍建议自行通读一遍。';

  /**
   * 是否像模板占位符。数字只有在短于最小长度时才算占位符，
   * 避免把 TOKEN_TTL=3600 这类合法数字判成占位符。
   */
  function isPlaceholder(value, minLength) {
    var text = String(value == null ? '' : value);
    var limit = Number(minLength) || 8;
    if (/^[0-9]+$/.test(text)) return text.length < limit;
    return PLACEHOLDER_PATTERNS.some(function (pattern) {
      return pattern.test(text);
    });
  }

  function isSecretKey(key, extraKeys) {
    var upper = String(key).toUpperCase();
    if (extraKeys && extraKeys.indexOf(upper) !== -1) return true;
    var segments = upper.split(/[^A-Z0-9]+/).filter(Boolean);
    if (!segments.length) return false;
    var last = segments[segments.length - 1];
    return SECRET_SEGMENTS.indexOf(last) !== -1;
  }

  /**
   * 去掉不在引号内的行尾注释：`KEY=3000 # 端口` -> `3000`，
   * 而 `KEY="a # b"` 里的 # 会保留。
   */
  function stripInlineComment(rawValue) {
    var inSingle = false;
    var inDouble = false;
    for (var i = 0; i < rawValue.length; i += 1) {
      var ch = rawValue.charAt(i);
      if (inDouble && ch === '\\') { i += 1; continue; }
      if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
      if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
      if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(rawValue.charAt(i - 1)))) {
        return rawValue.slice(0, i);
      }
    }
    return rawValue;
  }

  function keyOfLine(line) {
    var match = String(line).match(/^(?:export\s+)?\??\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    return match ? match[1] : '';
  }

  /**
   * 解析 dotenv 文本。
   * @returns {{entries: Array, malformed: Array, duplicates: Array}}
   */
  function parseEnv(text) {
    var entries = [];
    var malformed = [];
    var duplicates = [];
    var seen = new Map();
    var lines = String(text == null ? '' : text).split(/\r?\n/);

    lines.forEach(function (raw, index) {
      var lineNumber = index + 1;
      var line = raw.trim();
      if (line === '' || line.charAt(0) === '#') return;

      var optional = false;
      if (line.charAt(0) === '?') {
        optional = true;
        line = line.slice(1).trim();
      }

      var match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) {
        malformed.push({
          line: lineNumber,
          raw: raw,
          key: keyOfLine(line),
          reason: '不是 KEY=VALUE 形式，无法解析为变量'
        });
        return;
      }

      var key = match[1];
      var value = stripInlineComment(match[2]).trim();
      var quote = null;

      if (/^".*"$/.test(value)) {
        quote = '"';
        value = value.slice(1, -1);
      } else if (/^'.*'$/.test(value)) {
        quote = "'";
        value = value.slice(1, -1);
      } else if (/^["']/.test(value)) {
        malformed.push({
          line: lineNumber,
          raw: raw,
          key: key,
          reason: '引号未闭合，值可能被截断'
        });
        return;
      }

      if (seen.has(key)) {
        duplicates.push({ key: key, lines: [seen.get(key).line, lineNumber] });
      }

      var entry = {
        key: key,
        value: value,
        line: lineNumber,
        optional: optional,
        quote: quote,
        raw: raw
      };
      seen.set(key, entry);
      entries.push(entry);
    });

    return { entries: entries, malformed: malformed, duplicates: duplicates };
  }

  function lastByKey(parsed) {
    var map = new Map();
    parsed.entries.forEach(function (entry) {
      map.set(entry.key, entry);
    });
    return map;
  }

  /**
   * 连接串里的弱口令。用户名可以省略（redis://:123456@host:6379），
   * 阈值来自用户设定的最小长度。
   */
  function weakUrlPassword(value, minLength) {
    var limit = Number(minLength) || 8;
    var match = String(value).match(/^[a-z][a-z0-9+.-]*:\/\/([^:/@\s]*):([^@/\s]*)@/i);
    if (!match) return null;
    var password = match[2];
    if (password === '') return null;
    if (password.length < limit || /^[0-9]+$/.test(password) || WEAK_PASSWORDS.test(password)) {
      return password;
    }
    return null;
  }

  function makeIssue(severity, key, title, detail, why, fix, verify, location) {
    return {
      severity: severity,
      key: key || '',
      title: title,
      detail: detail || '',
      why: why,
      fix: fix,
      verify: verify,
      location: location || ''
    };
  }

  /**
   * 执行体检。
   * @param {string} exampleText .env.example 内容
   * @param {string} envText .env 内容
   * @param {{secretKeys?: string[], minSecretLength?: number}} options
   */
  function check(exampleText, envText, options) {
    options = options || {};
    var minLength = Number(options.minSecretLength) || 8;
    var extraSecrets = (options.secretKeys || [])
      .map(function (key) { return String(key).trim().toUpperCase(); })
      .filter(Boolean);

    var example = parseEnv(exampleText);
    var runtime = parseEnv(envText);
    var exampleMap = lastByKey(example);
    var runtimeMap = lastByKey(runtime);
    var issues = [];

    function countSecrets() {
      var total = 0;
      runtimeMap.forEach(function (entry, key) {
        if (isSecretKey(key, extraSecrets)) total += 1;
      });
      return total;
    }

    // 0. 没有模板就不评分：空输入绝不能显示成 100 分（B1）
    if (example.entries.length === 0 && example.malformed.length === 0) {
      return {
        status: 'no-template',
        issues: [],
        summary: { error: 0, warning: 0, info: 0 },
        score: null,
        projectedScore: null,
        stats: {
          exampleKeys: 0,
          runtimeKeys: runtimeMap.size,
          secrets: countSecrets(),
          malformed: runtime.malformed.length,
          duplicates: runtime.duplicates.length
        },
        example: example,
        runtime: runtime
      };
    }

    // 解析失败的行已经单独报过格式错误，不再重复报"缺少必需变量"（B2）
    var unparsedKeys = {};
    runtime.malformed.forEach(function (item) {
      if (item.key) unparsedKeys[item.key] = true;
    });

    // 只差大小写的键合并成一条问题（B9）
    var exampleLower = new Map();
    exampleMap.forEach(function (entry, key) {
      var lower = key.toLowerCase();
      if (!exampleLower.has(lower)) exampleLower.set(lower, key);
    });
    var caseTwins = new Map();
    var caseMatchedExample = new Set();
    runtimeMap.forEach(function (entry, key) {
      if (exampleMap.has(key)) return;
      var twin = exampleLower.get(key.toLowerCase());
      if (twin && twin !== key) {
        caseTwins.set(key, twin);
        caseMatchedExample.add(twin);
      }
    });

    // 1. 缺失必需变量
    exampleMap.forEach(function (entry, key) {
      if (entry.optional) return;
      if (runtimeMap.has(key)) return;
      if (caseMatchedExample.has(key)) return;
      if (unparsedKeys[key]) return;
      issues.push(makeIssue(
        'error', key, '缺少必需变量',
        '.env.example 声明了该变量，但 .env 中没有找到。',
        '运行时读取不到这个变量，应用可能启动失败，或悄悄回退到默认值，导致行为与预期不一致。',
        '在 .env 中补上 ' + key + '=...；若它确实可选，请在 .env.example 中写成 ?' + key + '=。',
        '重新体检，确认"缺少必需变量"消失。',
        '.env'
      ));
    });

    // 2. 未声明的多余变量
    runtimeMap.forEach(function (entry, key) {
      if (exampleMap.has(key)) return;
      if (caseTwins.has(key)) return;
      issues.push(makeIssue(
        'warning', key, '未在模板中声明',
        '.env 中存在该变量，但 .env.example 没有声明。',
        '团队成员不知道这个变量的存在，换环境部署时容易漏配；也可能是拼写错误，实际并没有生效。',
        '若确实需要，补进 .env.example 并写清用途；若是拼写错误，改正或删除。',
        '重新体检，确认该项不再出现。',
        '.env 第 ' + entry.line + ' 行'
      ));
    });

    // 2b. 只差大小写：一条问题点明两种写法
    caseTwins.forEach(function (exampleKey, runtimeKey) {
      var entry = runtimeMap.get(runtimeKey);
      issues.push(makeIssue(
        'warning', runtimeKey, '键名大小写不一致',
        '.env 里写的是 ' + runtimeKey + '，模板里声明的是 ' + exampleKey + '，两者只差大小写。',
        '在大小写敏感的环境里这是两个不同的变量：模板声明的那一个读不到，实际生效的是另一个，问题会被静默掩盖。',
        '把 .env 中的键名改成与模板一致的 ' + exampleKey + '。',
        '重新体检，确认"键名大小写不一致"和"缺少必需变量"都不再出现。',
        '.env 第 ' + entry.line + ' 行'
      ));
    });

    // 3. 必需变量为空
    exampleMap.forEach(function (exampleEntry, key) {
      var runtimeEntry = runtimeMap.get(key);
      if (!runtimeEntry || exampleEntry.optional) return;
      if (String(runtimeEntry.value).trim() === '') {
        issues.push(makeIssue(
          'error', key, '必需变量为空',
          '.env 中该变量存在，但值为空。',
          '空值在多数运行时里等同于"未配置"，服务可能鉴权失败或直接崩溃。',
          '填入真实值；若允许为空，请在模板中把它改成可选变量并给出默认值。',
          '重新体检，确认空值项消失。',
          '.env 第 ' + runtimeEntry.line + ' 行'
        ));
      }
    });

    // 4. 密钥类问题
    runtimeMap.forEach(function (entry, key) {
      if (!isSecretKey(key, extraSecrets)) return;
      var value = String(entry.value);
      if (value === '') return; // 空值已在上面报过

      if (isPlaceholder(value, minLength)) {
        issues.push(makeIssue(
          'error', key, '仍在使用占位符',
          '该密钥的值看起来是模板占位符（如 replace-me、dummy、dev），不是真实密钥。',
          '占位符被当成真实密钥使用，服务会鉴权失败；如果这样上线，还可能被误认为"已经配置好"，掩盖真正的问题。',
          '生成随机密钥（例如 openssl rand -hex 32），只写入 .env，不要提交到仓库。',
          '重新体检；并确认 .env 已被 .gitignore 忽略。',
          '.env 第 ' + entry.line + ' 行'
        ));
      } else if (value.length < minLength) {
        issues.push(makeIssue(
          'error', key, '密钥长度不足',
          '当前长度 ' + value.length + ' 位，低于设定的最小长度 ' + minLength + ' 位。',
          '过短的密钥更容易被暴力破解；一旦泄露，攻击成本很低。',
          '改用至少 ' + minLength + ' 位的随机字符，并同步更新所有使用该密钥的服务。',
          '重新体检，确认长度提示消失。',
          '.env 第 ' + entry.line + ' 行'
        ));
      }

      var exampleEntry = exampleMap.get(key);
      if (exampleEntry && String(exampleEntry.value) === value && !isPlaceholder(value, minLength)) {
        issues.push(makeIssue(
          'warning', key, '运行时沿用了示例值',
          '.env 与 .env.example 中该密钥的值完全相同。',
          '如果示例值本身是真实密钥，说明它已经进入仓库；如果只是本地开发值，也建议区分开发与生产。',
          '确认该值是否应当出现在示例文件中；生产环境使用独立密钥。',
          '重新体检，确认该项消失。',
          '.env 第 ' + entry.line + ' 行'
        ));
      }
    });

    // 4b. 示例文件疑似写入真实值：对所有键生效，由占位符/localhost/example.com 白名单过滤（B5）
    exampleMap.forEach(function (exampleEntry, key) {
      var exampleValue = String(exampleEntry.value);
      if (exampleValue === '') return;
      if (exampleValue.length < minLength) return;
      if (isPlaceholder(exampleValue, minLength)) return;
      issues.push(makeIssue(
        'warning', key, '示例文件疑似写入真实值',
        '.env.example 中该键的值不像占位符，长度也达到了真实值的量级。',
        '.env.example 会提交到仓库，真实值一旦进入版本历史，即使后来删除也很难彻底清除。',
        '把 .env.example 中的值改回 replace-me 或留空，只保留变量名与说明。',
        '在仓库历史中搜索该值，确认没有残留；如果它是密钥，请立即轮换。',
        '.env.example 第 ' + exampleEntry.line + ' 行'
      ));
    });

    // 5. 连接串弱口令
    runtimeMap.forEach(function (entry, key) {
      var password = weakUrlPassword(entry.value, minLength);
      if (!password) return;
      issues.push(makeIssue(
        'warning', key, '连接串包含弱口令',
        '连接串中的密码长度为 ' + password.length + ' 位，已隐去；低于最小长度 ' + minLength + ' 位或属于常见弱口令。',
        '数据库连接串里的弱口令是泄露后最容易被利用的入口，攻击者拿到配置即可直连数据库。',
        '改用强密码，并通过环境变量或密钥管理服务注入，不要写死在代码或示例文件中。',
        '重新体检；并在数据库侧确认该账号权限最小化。',
        '.env 第 ' + entry.line + ' 行'
      ));
    });

    // 6. 重复键
    runtime.duplicates.forEach(function (group) {
      issues.push(makeIssue(
        'warning', group.key, '变量重复定义',
        '该变量在第 ' + group.lines.join(' 行和第 ') + ' 行重复出现。',
        '后出现的值会覆盖先出现的值，实际生效的可能不是你以为的那一行。',
        '删除重复项，只保留一行，并确认保留的是正确值。',
        '重新体检，确认重复提示消失。',
        '.env 第 ' + group.lines.join('、') + ' 行'
      ));
    });

    // 7. 格式错误
    runtime.malformed.forEach(function (item) {
      issues.push(makeIssue(
        'error', '', '格式错误，无法解析',
        '第 ' + item.line + ' 行：' + item.reason + '。',
        '这一行不会被解析成变量，可能导致变量缺失或启动失败；错误还可能被后续行掩盖。',
        '改成 KEY=VALUE 形式；注释以 # 开头；值里有空格时用双引号包裹。',
        '重新体检，确认格式错误消失。',
        '.env 第 ' + item.line + ' 行'
      ));
    });

    example.malformed.forEach(function (item) {
      issues.push(makeIssue(
        'warning', '', '模板文件格式错误',
        '.env.example 第 ' + item.line + ' 行：' + item.reason + '。',
        '模板本身无法解析，团队按模板配置时会被误导。',
        '修正模板中的这一行，保持 KEY=VALUE 形式。',
        '重新体检，确认提示消失。',
        '.env.example 第 ' + item.line + ' 行'
      ));
    });

    // 8. 值含空格但未加引号
    runtime.entries.forEach(function (entry) {
      if (!entry.quote && /\s/.test(entry.value) && !/^\s*$/.test(entry.value)) {
        issues.push(makeIssue(
          'warning', entry.key, '值含空格但未加引号',
          '该值包含空格，且没有用引号包裹。',
          '不同 dotenv 实现可能截断或保留空格，导致实际读到的值与预期不一致。',
          '用双引号包裹整个值，例如 KEY="hello world"。',
          '重新体检，确认提示消失。',
          '.env 第 ' + entry.line + ' 行'
        ));
      }
    });

    // 9. 键名大小写
    runtimeMap.forEach(function (entry, key) {
      if (caseTwins.has(key)) return; // 已在"键名大小写不一致"里合并报过
      if (key !== key.toUpperCase()) {
        issues.push(makeIssue(
          'info', key, '键名包含小写字母',
          '环境变量通常约定使用大写。',
          '部分系统对环境变量大小写不敏感，混用大小写容易在不同环境中读到不同的值。',
          '统一改为大写，并同步修改代码中的读取处。',
          '重新体检，确认提示消失。',
          '.env 第 ' + entry.line + ' 行'
        ));
      }
    });

    var summary = { error: 0, warning: 0, info: 0 };
    issues.forEach(function (issue) { summary[issue.severity] += 1; });

    var score = 100 - (summary.error * SEVERITY_WEIGHT.error +
      summary.warning * SEVERITY_WEIGHT.warning +
      summary.info * SEVERITY_WEIGHT.info);
    score = Math.max(0, Math.min(100, score));

    // 修完错误与警告后剩下的分数；提示项仍会各扣 1 分，所以不会自动到 100（B10）
    var projected = 100 - summary.info * SEVERITY_WEIGHT.info;
    projected = Math.max(0, Math.min(100, projected));

    return {
      status: 'scored',
      issues: issues,
      summary: summary,
      score: score,
      projectedScore: projected,
      stats: {
        exampleKeys: exampleMap.size,
        runtimeKeys: runtimeMap.size,
        secrets: countSecrets(),
        malformed: runtime.malformed.length,
        duplicates: runtime.duplicates.length
      },
      example: example,
      runtime: runtime
    };
  }

  function scoreLabel(result) {
    if (result.score == null) return '未评分（缺少 .env.example 模板）';
    return '**' + result.score + ' / 100**';
  }

  function toMarkdown(result, meta) {
    meta = meta || {};
    var lines = [];
    lines.push('# EnvSafe 配置体检报告');
    lines.push('');
    lines.push('- 生成时间：' + (meta.generatedAt || new Date().toLocaleString('zh-CN')));
    lines.push('- 健康分：' + scoreLabel(result) +
      (result.projectedScore == null ? '' : '（修复错误与警告后预计 ' + result.projectedScore + ' 分）'));
    lines.push('- 问题统计：错误 ' + result.summary.error + ' · 警告 ' + result.summary.warning + ' · 提示 ' + result.summary.info);
    lines.push('- 变量统计：模板 ' + result.stats.exampleKeys + ' 项 · 运行配置 ' + result.stats.runtimeKeys + ' 项 · 密钥 ' + result.stats.secrets + ' 项');
    lines.push('');
    lines.push('## 问题清单');
    lines.push('');
    if (result.status === 'no-template') {
      lines.push('无法体检：没有可用的 .env.example 模板。');
    } else if (!result.issues.length) {
      lines.push('未发现问题，配置状态良好。');
    } else {
      var labels = { error: '错误', warning: '警告', info: '提示' };
      result.issues.forEach(function (issue, index) {
        lines.push('### ' + (index + 1) + '. [' + labels[issue.severity] + '] ' + (issue.key ? issue.key + ' · ' : '') + issue.title);
        lines.push('');
        if (issue.location) lines.push('- 位置：' + issue.location);
        if (issue.detail) lines.push('- 现象：' + issue.detail);
        lines.push('- 为什么危险：' + issue.why);
        lines.push('- 怎么改：' + issue.fix);
        lines.push('- 怎么验：' + issue.verify);
        lines.push('');
      });
    }
    lines.push('---');
    lines.push('由 EnvSafe 配置安全体检站生成。所有解析均在浏览器本地完成，配置内容未上传。');
    lines.push('');
    lines.push(REPORT_NOTICE);
    return lines.join('\n');
  }

  return {
    parseEnv: parseEnv,
    check: check,
    toMarkdown: toMarkdown,
    isPlaceholder: isPlaceholder,
    isSecretKey: isSecretKey,
    weakUrlPassword: weakUrlPassword,
    stripInlineComment: stripInlineComment,
    SEVERITY_WEIGHT: SEVERITY_WEIGHT,
    REPORT_NOTICE: REPORT_NOTICE
  };
});
