'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseArgs, parseCsv, parseEnvFile, stripInlineComment, validate, serializeResult, run } = require('../src/env-safe.js');

function writeFixture(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-safe-'));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

test('parses CLI arguments with secret options', () => {
  const args = parseArgs([
    'node',
    'env-safe.js',
    'check',
    '--example',
    '.env.example',
    '--env',
    '.env',
    '--secret-keys',
    'JWT_SECRET,API_KEY',
    '--min-secret-length',
    '12',
    '--format',
    'json'
  ]);

  assert.deepEqual(args.secretKeys, ['JWT_SECRET', 'API_KEY']);
  assert.equal(args.minSecretLength, 12);
  assert.equal(args.format, 'json');
});

test('parses comma-separated values', () => {
  assert.deepEqual(parseCsv(' JWT_SECRET, API_KEY,,LOCAL_ONLY '), ['JWT_SECRET', 'API_KEY', 'LOCAL_ONLY']);
});

test('parses dotenv files with comments, quotes, and optional keys', () => {
  const filePath = writeFixture('.env.example', [
    '# comment',
    'NODE_ENV=development',
    'QUOTED="hello world"',
    "SINGLE='single quoted'",
    '?OPTIONAL='
  ].join('\n'));

  const parsed = parseEnvFile(filePath);

  assert.equal(parsed.variables.get('NODE_ENV'), 'development');
  assert.equal(parsed.variables.get('QUOTED'), 'hello world');
  assert.equal(parsed.variables.get('SINGLE'), 'single quoted');
  assert.equal(parsed.optional.has('OPTIONAL'), true);
  assert.equal(parsed.errors.length, 0);
});

test('validates a matching environment file', () => {
  const example = writeFixture('.env.example', 'PORT=3000\nDATABASE_URL=postgres://localhost/app\n');
  const env = writeFixture('.env', 'PORT=3000\nDATABASE_URL=postgres://localhost/app\n');

  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: false, secretKeys: [] });

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.summary.exampleKeys, 2);
  assert.equal(result.summary.runtimeKeys, 2);
});

test('reports missing and empty required variables', () => {
  const example = writeFixture('.env.example', 'PORT=3000\nSECRET=\n');
  const env = writeFixture('.env', 'PORT=\n');

  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: false, secretKeys: [] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.code), ['empty_required', 'missing_required']);
});

test('reports extra variables by default', () => {
  const example = writeFixture('.env.example', 'PORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\nLOCAL_ONLY=true\n');

  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: false, secretKeys: [] });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'extra_key');
});

test('treats extra variables as errors in strict mode', () => {
  const example = writeFixture('.env.example', 'PORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\nLOCAL_ONLY=true\n');

  const result = validate({ examplePath: example, envPath: env, strict: true, allowExtra: false, secretKeys: [] });

  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'extra_key');
});

test('allows extra variables when requested', () => {
  const example = writeFixture('.env.example', 'PORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\nLOCAL_ONLY=true\n');

  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: true, secretKeys: [] });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 0);
});

test('warns when .env.example contains real-looking values', () => {
  const example = writeFixture('.env.example', 'JWT_SECRET=super-secret-123\nPORT=3000\n');
  const env = writeFixture('.env', 'JWT_SECRET=local-secret\nPORT=3000\n');

  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: false, secretKeys: [] });

  assert.equal(result.ok, true);
  assert.equal(result.warnings.some((warning) => warning.code === 'unsafe_example_value'), true);
});

test('validates declared secret values', () => {
  const example = writeFixture('.env.example', 'JWT_SECRET=replace-me\nPORT=3000\n');
  const env = writeFixture('.env', 'JWT_SECRET=short\nPORT=3000\n');

  const result = validate({
    examplePath: example,
    envPath: env,
    strict: false,
    allowExtra: false,
    secretKeys: ['JWT_SECRET'],
    minSecretLength: 8
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'secret_too_short'), true);
});

test('rejects placeholder secret values in runtime env', () => {
  const example = writeFixture('.env.example', 'JWT_SECRET=replace-me\nPORT=3000\n');
  const env = writeFixture('.env', 'JWT_SECRET=replace-me\nPORT=3000\n');

  const result = validate({
    examplePath: example,
    envPath: env,
    strict: false,
    allowExtra: false,
    secretKeys: ['JWT_SECRET'],
    minSecretLength: 8
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === 'secret_uses_placeholder'), true);
});

/* ---------- regression tests for the fixed CLI bugs ---------- */

test('--help wins over a missing command instead of failing (A1)', () => {
  for (const argv of [['node', 'env-safe.js', '--help'], ['node', 'env-safe.js', '-h'], ['node', 'env-safe.js', 'check', '--help']]) {
    const args = parseArgs(argv);
    assert.equal(args.help, true, `expected help for ${argv.join(' ')}`);
  }

  const help = run(['node', 'env-safe.js', '--help']);
  assert.equal(help.exitCode, 0);
  assert.match(help.output, /Usage:/);
  assert.match(help.output, /--min-secret-length/);
});

test('a bare invocation prints usage and exits 0 (A1)', () => {
  const result = run(['node', 'env-safe.js']);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /Usage:/);
});

test('an unknown command is still rejected (A1)', () => {
  assert.throws(() => parseArgs(['node', 'env-safe.js', 'nope']), /Unknown command: nope/);
});

test('JSON output serializes Maps/Sets and never leaks absolute paths (A2)', () => {
  const example = writeFixture('.env.example', 'PORT=3000\n?OPTIONAL_KEY=\nJWT_SECRET=replace-me\n');
  const env = writeFixture('.env', 'PORT=3000\nJWT_SECRET=replace-me\n');

  // Pass relative paths, exactly as a user would from the repo root.
  const relExample = path.relative(process.cwd(), example);
  const relEnv = path.relative(process.cwd(), env);

  const result = run([
    'node', 'env-safe.js', 'check',
    '--example', relExample,
    '--env', relEnv,
    '--format', 'json',
    '--secret-keys', 'JWT_SECRET'
  ]);

  const payload = JSON.parse(result.output);

  assert.deepEqual(Object.keys(payload), ['ok', 'errors', 'warnings', 'summary', 'secretKeys', 'example', 'env']);
  assert.equal(payload.ok, false);
  assert.equal(payload.example.path, relExample);
  assert.equal(payload.env.path, relEnv);
  assert.equal(path.isAbsolute(payload.example.path), false);
  assert.deepEqual(payload.example.keys, ['PORT', 'OPTIONAL_KEY', 'JWT_SECRET']);
  assert.deepEqual(payload.example.optional, ['OPTIONAL_KEY']);
  assert.deepEqual(payload.env.keys, ['PORT', 'JWT_SECRET']);
  assert.deepEqual(payload.secretKeys, ['JWT_SECRET']);
  assert.equal(payload.summary.exampleKeys, 3);
  assert.equal(payload.summary.runtimeKeys, 2);

  // The old shape leaked `filePath` and serialized maps as `{}`.
  assert.equal(result.output.includes('filePath'), false);
  assert.equal(result.output.includes('"variables": {}'), false);
});

test('serializeResult reports the path it was given (A2)', () => {
  const example = writeFixture('.env.example', 'PORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\n');
  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: false, secretKeys: [] });

  const payload = serializeResult(result, { example: 'custom/template.env', env: 'custom/runtime.env' });

  assert.equal(payload.example.path, 'custom/template.env');
  assert.equal(payload.env.path, 'custom/runtime.env');
  assert.deepEqual(payload.example.keys, ['PORT']);
});

test('a secret missing from both files is reported (A3)', () => {
  const example = writeFixture('.env.example', 'PORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\n');

  const result = validate({
    examplePath: example,
    envPath: env,
    strict: false,
    allowExtra: false,
    secretKeys: ['GHOST_SECRET'],
    minSecretLength: 8
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((error) => error.code), ['missing_secret']);
  assert.equal(result.errors[0].key, 'GHOST_SECRET');
});

test('an absent optional secret is not an error (A4)', () => {
  const example = writeFixture('.env.example', '?OPT_SECRET=replace-me\nPORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\n');

  const result = validate({
    examplePath: example,
    envPath: env,
    strict: false,
    allowExtra: false,
    secretKeys: ['OPT_SECRET'],
    minSecretLength: 8
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('a required secret that is absent is still reported (A4 guard)', () => {
  const example = writeFixture('.env.example', 'REQ_SECRET=replace-me\nPORT=3000\n');
  const env = writeFixture('.env', 'PORT=3000\n');

  const result = validate({
    examplePath: example,
    envPath: env,
    strict: false,
    allowExtra: false,
    secretKeys: ['REQ_SECRET'],
    minSecretLength: 8
  });

  assert.deepEqual(result.errors.map((error) => error.code), ['missing_required', 'missing_secret']);
});

test('parses a leading export and strips inline comments (A5)', () => {
  const filePath = writeFixture('.env.example', [
    'export EXPORTED=value',
    'PORT=3000 # the port',
    'NOTE="a # b"',
    'PLAIN=a#b',
    "SINGLE='x # y'",
    'ESCAPED="quote \\" # still quoted"'
  ].join('\n'));

  const parsed = parseEnvFile(filePath);

  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.variables.get('EXPORTED'), 'value');
  assert.equal(parsed.variables.get('PORT'), '3000');
  assert.equal(parsed.variables.get('NOTE'), 'a # b');
  assert.equal(parsed.variables.get('PLAIN'), 'a#b');
  assert.equal(parsed.variables.get('SINGLE'), 'x # y');
  // Escapes are not decoded (out of scope); what matters is that the `#` inside
  // the quotes is not treated as a comment.
  assert.equal(parsed.variables.get('ESCAPED'), 'quote \\" # still quoted');
});

test('stripInlineComment keeps hashes inside quotes', () => {
  assert.equal(stripInlineComment('3000 # port').trim(), '3000');
  assert.equal(stripInlineComment('"a # b"'), '"a # b"');
  assert.equal(stripInlineComment("'a # b'"), "'a # b'");
  assert.equal(stripInlineComment('a#b'), 'a#b');
  assert.equal(stripInlineComment('#whole line'), '');
});

test('a credential-free localhost URL is treated as a placeholder (A6)', () => {
  const example = writeFixture('.env.example', 'DATABASE_URL=postgres://localhost/app\nREDIS_URL=redis://127.0.0.1:6379\nPORT=3000\n');
  const env = writeFixture('.env', 'DATABASE_URL=postgres://localhost/app\nREDIS_URL=redis://127.0.0.1:6379\nPORT=3000\n');

  const result = validate({ examplePath: example, envPath: env, strict: false, allowExtra: false, secretKeys: [] });

  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
});

/* ---------- documentation accuracy ---------- */

function documentedJson(fileName) {
  const readme = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
  const block = readme.match(/```json\n([\s\S]*?)```/);
  assert.ok(block, `${fileName} has no JSON example block`);
  return JSON.parse(block[1]);
}

function cliJsonOutput() {
  const originalCwd = process.cwd();
  process.chdir(path.join(__dirname, '..'));
  try {
    const result = run([
      'node', 'env-safe.js', 'check',
      '--example', 'examples/.env.example',
      '--env', 'examples/.env.missing',
      '--format', 'json'
    ]);
    return JSON.parse(result.output);
  } finally {
    process.chdir(originalCwd);
  }
}

test('README JSON example matches real CLI output (C3)', () => {
  assert.deepEqual(documentedJson('README.md'), cliJsonOutput());
});

test('README.zh.md JSON example matches real CLI output (C3)', () => {
  assert.deepEqual(documentedJson('README.zh.md'), cliJsonOutput());
});

test('--help is documented in both READMEs (C4)', () => {
  for (const fileName of ['README.md', 'README.zh.md']) {
    const readme = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
    assert.match(readme, /\|\s*`--help`/, `${fileName} does not document --help`);
  }
});

test('both READMEs document the browser app (C2)', () => {
  for (const fileName of ['README.md', 'README.zh.md']) {
    const readme = fs.readFileSync(path.join(__dirname, '..', fileName), 'utf8');
    assert.match(readme, /web\//, `${fileName} project structure omits web/`);
    assert.match(readme, /08_作品截图/, `${fileName} does not point at the screenshot folder`);
  }
});

test('surfaces warnings on a passing run instead of hiding them', () => {
  const example = writeFixture('.env.example', 'PORT=3000\nJWT_SECRET=replace-me\n?OPT=\n');
  const env = writeFixture('.env', 'PORT=3000\nJWT_SECRET=local-dev-secret\nLOCAL_ONLY=true\n');

  const result = run([
    'node',
    'env-safe.js',
    'check',
    '--example',
    example,
    '--env',
    env
  ]);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /all checks passed/);
  assert.match(result.output, /WARN\s+extra_key/, 'warnings must be printed even when the run passes');
});

test('prints the bare success line when there is nothing to warn about', () => {
  const example = writeFixture('.env.example', 'PORT=3000\nJWT_SECRET=replace-me\n');
  const env = writeFixture('.env', 'PORT=3000\nJWT_SECRET=local-dev-secret\n');

  const result = run([
    'node',
    'env-safe.js',
    'check',
    '--example',
    example,
    '--env',
    env
  ]);

  assert.equal(result.exitCode, 0);
  assert.equal(result.output, 'env-safe: all checks passed');
});
