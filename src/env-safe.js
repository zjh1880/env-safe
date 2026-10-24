#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^<.+>$/i,
  /^(replace[-_]?me|change[-_]?me|example|dummy|todo|placeholder)$/i,
  /^(your_|example_|dummy_|todo_|replace[-_]?)/i,
  /^[0-9]+$/,
  /^(true|false|development|production|test)$/i,
  /^https?:\/\/([^./]+\.)?example\.com/i,
  /^https?:\/\/(localhost|127\.0\.0\.1)/i,
  // Any scheme pointing at localhost / 127.0.0.1, with or without credentials.
  // Covers `postgres://localhost/app`, `redis://:pw@localhost:6379`, and friends.
  /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@\s]*@)?(?:localhost|127\.0\.0\.1)(?::[0-9]+)?(?:[/?#]|$)/i
];

function usage() {
  return `env-safe v1.1.0

Usage:
  env-safe check --example .env.example --env .env [--strict] [--allow-extra] [--format text|json]
  env-safe report --example .env.example --env .env [--format text|json]
  env-safe diff  --example .env.example --env .env

Commands:
  check  Validate a runtime .env file against .env.example.
  report Print a compact validation summary.
  diff   Print a readable comparison between .env.example and .env.

Options:
  --example <path>       Template file. Default: .env.example
  --env <path>           Runtime file. Default: .env
  --strict               Treat warnings as failures.
  --allow-extra          Allow keys in .env that are not declared in .env.example.
  --secret-keys <keys>   Comma-separated secret keys that must be non-empty and real.
  --min-secret-length <n> Minimum length for secret values. Default: 8
  --format <format>      Output format: text or json. Default: text
  --help, -h             Show this help message.
`;
}

function parseArgs(argv) {
  const args = {
    command: null,
    example: '.env.example',
    env: '.env',
    format: 'text',
    strict: false,
    allowExtra: false,
    secretKeys: [],
    minSecretLength: 8,
    help: false
  };

  const rest = argv.slice(2);

  // --help / -h is honoured anywhere, including before the command (A1).
  if (rest.some((arg) => arg === '--help' || arg === '-h')) {
    args.help = true;
    return args;
  }

  let index = 0;
  if (rest.length > 0 && !rest[0].startsWith('-')) {
    args.command = rest[0];
    index = 1;
  }

  for (; index < rest.length; index += 1) {
    const arg = rest[index];
    const next = rest[index + 1];

    if (arg === '--strict') {
      args.strict = true;
      continue;
    }
    if (arg === '--allow-extra') {
      args.allowExtra = true;
      continue;
    }
    if (arg === '--example' || arg === '--env' || arg === '--format' || arg === '--secret-keys' || arg === '--min-secret-length') {
      if (!next || next.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === '--example') args.example = next;
      if (arg === '--env') args.env = next;
      if (arg === '--format') args.format = next;
      if (arg === '--secret-keys') args.secretKeys = parseCsv(next);
      if (arg === '--min-secret-length') args.minSecretLength = Number(next);
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  // No command at all: print usage on stdout and exit 0 (A1).
  if (!args.command) {
    args.help = true;
    return args;
  }

  if (!['check', 'report', 'diff'].includes(args.command)) {
    throw new Error(`Unknown command: ${args.command}. Use check, report, or diff`);
  }
  if (!['text', 'json'].includes(args.format)) {
    throw new Error('--format must be either text or json');
  }
  if (!Number.isInteger(args.minSecretLength) || args.minSecretLength < 1) {
    throw new Error('--min-secret-length must be an integer greater than or equal to 1');
  }

  return args;
}

function parseCsv(value) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseEnvFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const variables = new Map();
  const optional = new Set();
  const errors = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, zeroBasedIndex) => {
    const lineNumber = zeroBasedIndex + 1;
    const trimmed = line.trim();

    if (trimmed === '' || trimmed.startsWith('#')) {
      return;
    }

    // `export KEY=value` is accepted; `?` marks the key optional (A5).
    const match = /^(?:export\s+)?(?<optional>\?)?(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$/.exec(trimmed);
    if (!match) {
      errors.push({
        code: 'malformed_line',
        line: lineNumber,
        message: `Line ${lineNumber} is not a valid KEY=value declaration`
      });
      return;
    }

    const key = match.groups.key;
    // Strip a trailing `# comment` that is outside quotes (A5).
    const value = unquote(stripInlineComment(match.groups.value).trim());

    if (variables.has(key)) {
      errors.push({
        code: 'duplicate_key',
        key,
        line: lineNumber,
        message: `Key ${key} is declared more than once`
      });
      return;
    }

    variables.set(key, value);
    if (match.groups.optional === '?') {
      optional.add(key);
    }
  });

  return { filePath, variables, optional, errors };
}

function unquote(value) {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * Cut a trailing `# comment` that starts at a `#` preceded by whitespace and
 * sits outside any quoted section. `KEY=3000 # port` -> `3000`, while
 * `KEY="a # b"` keeps the hash (A5).
 */
function stripInlineComment(rawValue) {
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < rawValue.length; index += 1) {
    const char = rawValue[index];

    if (inDouble && char === '\\') {
      index += 1;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble && (index === 0 || /\s/.test(rawValue[index - 1]))) {
      return rawValue.slice(0, index);
    }
  }

  return rawValue;
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function addError(errors, error) {
  errors.push(error);
}

function validate(options) {
  const example = parseEnvFile(options.examplePath);
  const env = parseEnvFile(options.envPath);
  const secretKeys = new Set(options.secretKeys || []);
  const errors = [];
  const warnings = [];

  errors.push(...example.errors.map((error) => ({ ...error, file: 'example' })));
  errors.push(...env.errors.map((error) => ({ ...error, file: 'runtime' })));

  for (const [key, value] of example.variables) {
    const required = !example.optional.has(key);

    if (!env.variables.has(key)) {
      if (required) {
        addError(errors, {
          code: 'missing_required',
          key,
          message: `Required key ${key} is missing from .env`
        });
        // An optional key that is absent is not an error, even when it is
        // listed in --secret-keys (A4).
        if (secretKeys.has(key)) {
          addError(errors, {
            code: 'missing_secret',
            key,
            message: `Secret key ${key} is missing from .env`
          });
        }
      }
      continue;
    }

    const runtimeValue = env.variables.get(key);
    if (required && runtimeValue === '') {
      addError(errors, {
        code: 'empty_required',
        key,
        message: `Required key ${key} is empty in .env`
      });
    }

    if (secretKeys.has(key)) {
      validateSecret(errors, key, runtimeValue, options.minSecretLength);
    }
  }

  // A secret requested via --secret-keys that is declared in neither file
  // would otherwise never be reported (A3).
  for (const key of secretKeys) {
    if (!example.variables.has(key) && !env.variables.has(key)) {
      addError(errors, {
        code: 'missing_secret',
        key,
        message: `Secret key ${key} is missing from .env`
      });
    }
  }

  for (const key of env.variables.keys()) {
    if (!example.variables.has(key) && !options.allowExtra) {
      const error = {
        code: 'extra_key',
        key,
        message: `Key ${key} exists in .env but not in .env.example`
      };
      if (options.strict) {
        addError(errors, error);
      } else {
        warnings.push(error);
      }
    }

    if (secretKeys.has(key) && !example.variables.has(key)) {
      addError(errors, {
        code: 'secret_not_declared',
        key,
        message: `Secret key ${key} exists in .env but is not declared in .env.example`
      });
    }
  }

  for (const [key, value] of example.variables) {
    if (!isPlaceholder(value)) {
      warnings.push({
        code: 'unsafe_example_value',
        key,
        message: `Key ${key} in .env.example looks like a real value. Use a placeholder instead.`
      });
    }
  }

  for (const [key, value] of env.variables) {
    if (value === '' && !example.variables.has(key)) {
      warnings.push({
        code: 'empty_extra_key',
        key,
        message: `Extra key ${key} is empty in .env`
      });
    }
  }

  if (options.strict) {
    errors.push(...warnings);
    warnings.length = 0;
  }

  return withSummary({
    ok: errors.length === 0,
    errors,
    warnings,
    example,
    env,
    secretKeys: [...secretKeys]
  });
}

function validateSecret(errors, key, value, minLength) {
  if (value === '') {
    addError(errors, {
      code: 'empty_secret',
      key,
      message: `Secret key ${key} is empty in .env`
    });
    return;
  }
  if (isPlaceholder(value)) {
    addError(errors, {
      code: 'secret_uses_placeholder',
      key,
      message: `Secret key ${key} still uses a placeholder value`
    });
    return;
  }
  if (value.length < minLength) {
    addError(errors, {
      code: 'secret_too_short',
      key,
      message: `Secret key ${key} is shorter than ${minLength} characters`
    });
  }
}

function withSummary(result) {
  return {
    ...result,
    summary: {
      exampleKeys: result.example.variables.size,
      runtimeKeys: result.env.variables.size,
      errors: result.errors.length,
      warnings: result.warnings.length,
      secrets: result.secretKeys.length
    }
  };
}

/**
 * Build the public JSON shape. Maps/Sets are flattened to arrays and file
 * paths are reported exactly as given on the command line, never resolved to
 * absolute local paths (A2).
 */
function serializeResult(result, labels) {
  const paths = labels || {};
  return {
    ok: result.ok,
    errors: result.errors,
    warnings: result.warnings,
    summary: result.summary,
    secretKeys: result.secretKeys,
    example: summarizeFile(result.example, paths.example),
    env: summarizeFile(result.env, paths.env)
  };
}

function summarizeFile(parsed, label) {
  return {
    path: label || null,
    keys: [...parsed.variables.keys()],
    optional: [...parsed.optional]
  };
}

function formatText(result) {
  if (result.ok) {
    // Warnings still matter: printing only "all checks passed" hides the one
    // signal a user needs before shipping. Keep the headline stable and append
    // the warnings underneath.
    if (result.warnings.length === 0) {
      return 'env-safe: all checks passed';
    }
    const lines = [`env-safe: all checks passed with ${result.warnings.length} warning(s)`];
    for (const warning of result.warnings) {
      lines.push(`WARN  ${warning.code}: ${warning.message}`);
    }
    return lines.join('\n');
  }

  const lines = ['env-safe: validation failed'];
  for (const error of result.errors) {
    lines.push(`ERROR ${error.code}: ${error.message}`);
  }
  for (const warning of result.warnings) {
    lines.push(`WARN  ${warning.code}: ${warning.message}`);
  }
  return lines.join('\n');
}

function formatReport(result) {
  const status = result.ok ? 'ok' : 'failed';
  return [
    'env-safe report',
    `status: ${status}`,
    `exampleKeys: ${result.summary.exampleKeys}`,
    `runtimeKeys: ${result.summary.runtimeKeys}`,
    `errors: ${result.summary.errors}`,
    `warnings: ${result.summary.warnings}`,
    `secrets: ${result.summary.secrets}`
  ].join('\n');
}

function formatDiff(example, env) {
  const lines = [];

  for (const key of example.variables.keys()) {
    const exampleValue = example.variables.get(key);
    if (!env.variables.has(key)) {
      lines.push(`- ${key}=${exampleValue}`);
      continue;
    }
    const envValue = env.variables.get(key);
    lines.push(`  ${key}=${envValue}`);
  }

  for (const key of env.variables.keys()) {
    if (!example.variables.has(key)) {
      lines.push(`+ ${key}=${env.variables.get(key)}`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'env-safe: no differences';
}

function run(argv) {
  const args = parseArgs(argv);

  if (args.help || !args.command) {
    return { exitCode: 0, output: usage() };
  }

  const examplePath = path.resolve(args.example);
  const envPath = path.resolve(args.env);

  if (!fs.existsSync(examplePath)) {
    return { exitCode: 2, output: `env-safe: example file not found: ${args.example}` };
  }
  if (!fs.existsSync(envPath)) {
    return { exitCode: 2, output: `env-safe: env file not found: ${args.env}` };
  }

  if (args.command === 'diff') {
    const example = parseEnvFile(examplePath);
    const env = parseEnvFile(envPath);
    const output = formatDiff(example, env);
    return { exitCode: example.errors.length || env.errors.length ? 2 : 0, output };
  }

  const result = validate({
    examplePath,
    envPath,
    strict: args.strict,
    allowExtra: args.allowExtra,
    secretKeys: args.secretKeys,
    minSecretLength: args.minSecretLength
  });

  let output;
  const labels = { example: args.example, env: args.env };
  if (args.command === 'report') {
    output = args.format === 'json'
      ? JSON.stringify(serializeResult(result, labels), null, 2)
      : formatReport(result);
  } else {
    output = args.format === 'json'
      ? JSON.stringify(serializeResult(result, labels), null, 2)
      : formatText(result);
  }

  return { exitCode: result.ok ? 0 : 1, output };
}

if (require.main === module) {
  try {
    const result = run(process.argv);
    process.stdout.write(`${result.output}\n`);
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage()}`);
    process.exitCode = 2;
  }
}

module.exports = {
  parseArgs,
  parseCsv,
  parseEnvFile,
  stripInlineComment,
  validate,
  serializeResult,
  run
};
