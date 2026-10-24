'use strict';

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../js/engine.js');

test('parseEnv 读取普通变量、注释与空行', () => {
  const parsed = engine.parseEnv([
    '# 注释',
    '',
    'NODE_ENV=production',
    'PORT = 3000',
    'PUBLIC_API_URL="https://api.example.com"'
  ].join('\n'));
  assert.strictEqual(parsed.entries.length, 3);
  assert.strictEqual(parsed.entries[0].key, 'NODE_ENV');
  assert.strictEqual(parsed.entries[0].value, 'production');
  assert.strictEqual(parsed.entries[2].value, 'https://api.example.com');
  assert.strictEqual(parsed.entries[2].quote, '"');
});

test('parseEnv 识别可选变量、重复键与格式错误', () => {
  const parsed = engine.parseEnv([
    '?SENTRY_DSN=',
    'PORT=3000',
    'PORT=3001',
    'THIS IS NOT VALID',
    'KEY="unclosed'
  ].join('\n'));
  assert.strictEqual(parsed.entries[0].optional, true);
  assert.strictEqual(parsed.duplicates.length, 1);
  assert.strictEqual(parsed.duplicates[0].key, 'PORT');
  assert.strictEqual(parsed.malformed.length, 2);
});

test('check 检出缺失必需变量与未声明变量', () => {
  const example = 'NODE_ENV=development\nPORT=3000\nREDIS_URL=';
  const runtime = 'NODE_ENV=production\nPORT=3000\nDEBUG_MODE=true';
  const result = engine.check(example, runtime);
  const keys = result.issues.map((issue) => issue.key);
  assert.ok(keys.includes('REDIS_URL'));
  assert.ok(keys.includes('DEBUG_MODE'));
  assert.strictEqual(result.summary.error >= 1, true);
  assert.strictEqual(result.summary.warning >= 1, true);
});

test('check 检出空值与占位符密钥', () => {
  const example = 'JWT_SECRET=replace-me\nDB_PASSWORD=';
  const runtime = 'JWT_SECRET=replace-me\nDB_PASSWORD=';
  const result = engine.check(example, runtime);
  const titles = result.issues.map((issue) => issue.title);
  assert.ok(titles.includes('仍在使用占位符'));
  assert.ok(titles.includes('必需变量为空'));
});

test('check 检出过短的密钥', () => {
  const example = 'JWT_SECRET=replace-me';
  const runtime = 'JWT_SECRET=dev';
  const result = engine.check(example, runtime, { minSecretLength: 8 });
  assert.ok(result.issues.some((issue) => issue.title === '仍在使用占位符' || issue.title === '密钥长度不足'));
});

test('check 检出示例文件中的真实密钥', () => {
  const example = 'JWT_SECRET=8f3c2a9b7d1e4f60';
  const runtime = 'JWT_SECRET=8f3c2a9b7d1e4f60';
  const result = engine.check(example, runtime);
  assert.ok(result.issues.some((issue) => issue.title === '示例文件疑似写入真实值'));
});

test('check 检出连接串弱口令', () => {
  const example = 'DATABASE_URL=postgres://user:password@localhost:5432/app';
  const runtime = 'DATABASE_URL=postgres://admin:123456@db.internal:5432/app';
  const result = engine.check(example, runtime);
  assert.ok(result.issues.some((issue) => issue.title === '连接串包含弱口令'));
});

test('check 通过时给出 100 分', () => {
  const example = 'NODE_ENV=development\nPORT=3000\nJWT_SECRET=replace-me';
  const runtime = 'NODE_ENV=production\nPORT=3000\nJWT_SECRET=' + 'a'.repeat(40);
  const result = engine.check(example, runtime);
  assert.strictEqual(result.summary.error, 0);
  assert.strictEqual(result.summary.warning, 0);
  assert.strictEqual(result.score, 100);
});

test('toMarkdown 输出报告标题与问题条目', () => {
  const result = engine.check('JWT_SECRET=replace-me', 'JWT_SECRET=dev');
  const markdown = engine.toMarkdown(result, { generatedAt: '2026-10-22 21:00' });
  assert.ok(markdown.includes('# EnvSafe 配置体检报告'));
  assert.ok(markdown.includes('健康分'));
  assert.ok(markdown.includes('问题清单'));
});

test('弱口令识别函数', () => {
  assert.strictEqual(engine.weakUrlPassword('postgres://u:123456@host/db'), '123456');
  assert.strictEqual(engine.weakUrlPassword('postgres://u:Str0ngPassw0rd@host/db'), null);
});

/* ---------- regression tests for the fixed engine bugs ---------- */

test('空白输入不评分，也不报"状态良好" (B1)', () => {
  const blank = engine.check('', '');
  assert.strictEqual(blank.status, 'no-template');
  assert.strictEqual(blank.score, null);
  assert.strictEqual(blank.projectedScore, null);
  assert.deepStrictEqual(blank.issues, []);
  assert.strictEqual(blank.stats.exampleKeys, 0);

  const commentsOnly = engine.check('# 只有注释\n\n', 'PORT=3000');
  assert.strictEqual(commentsOnly.status, 'no-template');
  assert.strictEqual(commentsOnly.score, null);
});

test('缺少模板的报告不会输出伪造的分数 (B1)', () => {
  const markdown = engine.toMarkdown(engine.check('', ''), { generatedAt: '2026-10-23 10:00' });
  assert.ok(markdown.includes('未评分'));
  assert.ok(markdown.includes('无法体检'));
  assert.ok(!markdown.includes('100 / 100'));
});

test('带引号的值加行尾注释只解析为一行合法声明 (B2)', () => {
  const result = engine.check('A=1', 'A="hello world" # note');
  assert.deepStrictEqual(result.issues, []);
  assert.strictEqual(result.score, 100);

  const parsed = engine.parseEnv('A="hello world" # note');
  assert.strictEqual(parsed.entries.length, 1);
  assert.strictEqual(parsed.entries[0].value, 'hello world');
  assert.strictEqual(parsed.entries[0].quote, '"');
});

test('解析失败的行不会再补一条"缺少必需变量" (B2)', () => {
  const result = engine.check('A=1', 'A="unclosed');
  assert.strictEqual(result.issues.length, 1);
  assert.strictEqual(result.issues[0].title, '格式错误，无法解析');
  assert.ok(!result.issues.some((issue) => issue.title === '缺少必需变量'));
});

test('合法数字与带后缀的键名不再被误判 (B3)', () => {
  const result = engine.check(
    'TOKEN_TTL=3600\nAPI_KEY=replace-me',
    'TOKEN_TTL=3600\nAPI_KEY=12345678901234567890'
  );
  assert.ok(!result.issues.some((issue) => issue.title === '仍在使用占位符'));

  const rotation = engine.check('SECRET_ROTATION_DAYS=replace-me', 'SECRET_ROTATION_DAYS=30');
  assert.deepStrictEqual(rotation.issues, []);

  const accessKeyId = engine.check('ACCESS_KEY_ID=replace-me', 'ACCESS_KEY_ID=AKIA1234567890');
  assert.deepStrictEqual(accessKeyId.issues, []);

  // 短数字仍然是占位符
  const shortNumeric = engine.check('API_KEY=replace-me', 'API_KEY=12345');
  assert.ok(shortNumeric.issues.some((issue) => issue.title === '仍在使用占位符'));
});

test('密钥字段按键名分段识别 (B3)', () => {
  assert.strictEqual(engine.isSecretKey('JWT_SECRET'), true);
  assert.strictEqual(engine.isSecretKey('DB_PASSWORD'), true);
  assert.strictEqual(engine.isSecretKey('API_KEY'), true);
  assert.strictEqual(engine.isSecretKey('PRIVATE_KEY'), true);
  assert.strictEqual(engine.isSecretKey('TOKEN_TTL'), false);
  assert.strictEqual(engine.isSecretKey('SECRET_ROTATION_DAYS'), false);
  assert.strictEqual(engine.isSecretKey('ACCESS_KEY_ID'), false);
  assert.strictEqual(engine.isSecretKey('DATABASE_URL'), false);
  assert.strictEqual(engine.isSecretKey('MY_CUSTOM', ['MY_CUSTOM']), true);
});

test('报告里不出现连接串密码原文 (B4)', () => {
  const result = engine.check(
    'DATABASE_URL=postgres://user:password@localhost:5432/app',
    'DATABASE_URL=postgres://app:hunter2@db.prod.internal:5432/main'
  );
  const issue = result.issues.find((item) => item.title === '连接串包含弱口令');
  assert.ok(issue);
  assert.ok(issue.detail.includes('已隐去'));
  assert.ok(issue.detail.includes('7 位'));
  assert.ok(!issue.detail.includes('hunter2'));

  const markdown = engine.toMarkdown(result, { generatedAt: '2026-10-23 10:00' });
  assert.ok(!markdown.includes('hunter2'));
  assert.ok(markdown.includes(engine.REPORT_NOTICE));
  assert.ok(engine.REPORT_NOTICE.length > 0);
});

test('示例文件里的真实值在非密钥键名上也能被发现 (B5)', () => {
  const stripe = engine.check(
    'STRIPE_KEY=sk_live_51Habcdefghijklmnop\nPORT=3000',
    'STRIPE_KEY=sk_live_51Habcdefghijklmnop\nPORT=3000'
  );
  assert.ok(stripe.issues.some((issue) => issue.title === '示例文件疑似写入真实值' && issue.key === 'STRIPE_KEY'));

  const sentry = engine.check(
    'SENTRY_DSN=https://abc123@o1.ingest.sentry.io/42',
    'SENTRY_DSN=https://abc123@o1.ingest.sentry.io/42'
  );
  assert.ok(sentry.issues.some((issue) => issue.title === '示例文件疑似写入真实值' && issue.key === 'SENTRY_DSN'));

  // 白名单内的示例值不应误报
  const clean = engine.check(
    'PORT=3000\nNODE_ENV=development\nPUBLIC_API_URL=https://api.example.com\nDATABASE_URL=postgres://user:password@localhost:5432/app',
    'PORT=8080\nNODE_ENV=production\nPUBLIC_API_URL=https://api.example.com\nDATABASE_URL=postgres://app:Str0ng-Passw0rd@db.internal:5432/app'
  );
  assert.deepStrictEqual(clean.issues, []);
});

test('无用户名的连接串也会检查弱口令，并使用用户设定的最小长度 (B6)', () => {
  const userless = engine.check('REDIS_URL=redis://localhost:6379', 'REDIS_URL=redis://:123456@host:6379');
  const issue = userless.issues.find((item) => item.title === '连接串包含弱口令');
  assert.ok(issue);
  assert.ok(!issue.detail.includes('123456'));

  assert.strictEqual(engine.weakUrlPassword('redis://:123456@host:6379'), '123456');
  assert.strictEqual(engine.weakUrlPassword('redis://:Str0ngPassw0rd@host:6379'), null);
  assert.strictEqual(engine.weakUrlPassword('redis://host:6379'), null);

  // 默认 8 位时 abc12345 合规，阈值调到 20 位后应当报错
  const example = 'DATABASE_URL=postgres://user:password@localhost:5432/app';
  const runtime = 'DATABASE_URL=postgres://app:abc12345@db.internal:5432/main';
  assert.deepStrictEqual(engine.check(example, runtime, { minSecretLength: 8 }).issues, []);
  assert.ok(engine.check(example, runtime, { minSecretLength: 20 })
    .issues.some((item) => item.title === '连接串包含弱口令'));
});

test('只差大小写的键合并成一条问题 (B9)', () => {
  const result = engine.check(
    'DATABASE_URL=replace-me\nPORT=3000',
    'DATABASE_URL=x\nPORT=3000\ndatabase_url=y'
  );

  assert.strictEqual(result.issues.length, 1);
  const issue = result.issues[0];
  assert.strictEqual(issue.title, '键名大小写不一致');
  assert.strictEqual(issue.key, 'database_url');
  assert.ok(issue.detail.includes('database_url'));
  assert.ok(issue.detail.includes('DATABASE_URL'));
  assert.ok(!result.issues.some((item) => item.title === '缺少必需变量'));
  assert.ok(!result.issues.some((item) => item.title === '未在模板中声明'));
  assert.ok(!result.issues.some((item) => item.title === '键名包含小写字母'));
});

test('修复后预计分与标签一致，且不会被说成 100 分 (B10)', () => {
  const result = engine.check('debug_mode=off\nNODE_ENV=development', 'debug_mode=on\nNODE_ENV=production');
  assert.strictEqual(result.summary.info, 1);
  assert.strictEqual(result.summary.error, 0);
  assert.strictEqual(result.summary.warning, 0);
  assert.strictEqual(result.score, 99);
  assert.strictEqual(result.projectedScore, 99);

  const markdown = engine.toMarkdown(result, { generatedAt: '2026-10-23 10:00' });
  assert.ok(markdown.includes('修复错误与警告后预计 99 分'));
  assert.ok(!markdown.includes('修复后预计 100 分'));
});

test('清理过的示例配置仍然拿满分（回归保护）', () => {
  const example = [
    'NODE_ENV=development',
    'PORT=3000',
    'DATABASE_URL=postgres://user:password@localhost:5432/app',
    'JWT_SECRET=replace-me',
    'PUBLIC_API_URL=https://api.example.com',
    '?SENTRY_DSN='
  ].join('\n');
  const runtime = [
    'NODE_ENV=production',
    'PORT=8080',
    'DATABASE_URL=postgres://app:Str0ng-Passw0rd@db.internal:5432/app',
    'JWT_SECRET=9f2c7a1e5b8d3c6f0a4e2d9b7c1f8a3e',
    'PUBLIC_API_URL=https://api.example.com'
  ].join('\n');

  const result = engine.check(example, runtime);
  assert.deepStrictEqual(result.issues, []);
  assert.strictEqual(result.score, 100);
  assert.strictEqual(result.projectedScore, 100);
});
