import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBrowserMatrix, requiredCases } from './assert-pulse-browser-matrix.mjs';

const browserErrors = (errors) => ({
  name: 'browser-errors',
  contentType: 'application/json',
  body: Buffer.from(JSON.stringify(errors)).toString('base64'),
});

function completeReport() {
  const specs = [];
  for (const engine of ['', 'firefox-']) {
    for (const device of ['desktop', 'mobile']) {
      for (const renderer of ['webgl2', 'canvas2d']) {
        for (const { file, title, evidence } of requiredCases) {
          specs.push({
            file, title,
            tests: [{
              projectName: `${engine}${device}-${renderer}`,
              expectedStatus: 'passed',
              status: 'expected',
              results: [{
                status: 'passed',
                retry: 0,
                errors: [],
                attachments: [
                  ...['environment-capabilities', 'renderer-startup', ...evidence].map((name) => ({ name })),
                  browserErrors([]),
                ],
              }],
            }],
          });
        }
      }
    }
  }
  return { errors: [], suites: [{ suites: [{ specs }] }] };
}

const specs = (r) => r.suites[0].suites[0].specs;
const firstTest = (r) => specs(r)[0].tests[0];
const firstResult = (r) => firstTest(r).results[0];

test('accepts the complete 72-case core and persistence matrix with evidence', () => {
  const report = completeReport();
  assert.equal(specs(report).length, 72);
  assert.doesNotThrow(() => assertBrowserMatrix(report));
});

for (const [name, mutate] of [
  ['old core-only report', (r) => { r.suites[0].suites[0].specs = specs(r).filter((s) => s.file === 'journey.spec.ts'); }],
  ['out-of-scope WebKit project', (r) => { firstTest(r).projectName = 'webkit-desktop-webgl2'; }],
  ['omitted project', (r) => { specs(r).splice(0, requiredCases.length); }],
  ['empty report', (r) => { r.suites = []; }],
  ['skipped test', (r) => { firstResult(r).status = 'skipped'; }],
  ['expected skip', (r) => { firstTest(r).expectedStatus = 'skipped'; }],
  ['expected failure', (r) => { firstTest(r).expectedStatus = 'failed'; }],
  ['failed test', (r) => { firstResult(r).status = 'failed'; }],
  ['interrupted test', (r) => { firstResult(r).status = 'interrupted'; }],
  ['timed out test', (r) => { firstResult(r).status = 'timedOut'; }],
  ['flaky outcome', (r) => { firstTest(r).status = 'flaky'; }],
  ['missing evidence', (r) => { firstResult(r).attachments = []; }],
  ['retry', (r) => { firstTest(r).results.push(firstResult(r)); }],
  ['only a successful retry retained', (r) => { firstResult(r).retry = 1; }],
  ['no launch results', (r) => { firstTest(r).results = []; }],
  ['launch error despite passed status', (r) => { firstResult(r).errors.push({ message: 'browserType.launch: executable missing' }); }],
  ['singular result error', (r) => { firstResult(r).error = { message: 'browser disconnected' }; }],
  ['global error', (r) => { r.errors.push({ message: 'browser setup failed' }); }],
  ['substitute case', (r) => { specs(r)[5].title += ' substitute'; }],
  ['wrong spec file', (r) => { specs(r)[5].file = 'other.spec.ts'; }],
  ['duplicate case replacing a missing one', (r) => { specs(r)[5] = specs(r)[4]; }],
  ['missing browser error evidence', (r) => { firstResult(r).attachments.pop(); }],
  ['fatal browser error on otherwise passed case', (r) => { firstResult(r).attachments.push(browserErrors(['Uncaught SecurityError'])); firstResult(r).attachments.splice(-2, 1); }],
  ['ambiguous browser error evidence', (r) => { firstResult(r).attachments.push(browserErrors(['Page crashed'])); }],
  ['malformed browser error evidence', (r) => { firstResult(r).attachments.at(-1).body = 'invalid'; }],
  ['missing browser error payload', (r) => { delete firstResult(r).attachments.at(-1).body; }],
  ['non-array browser error payload', (r) => { firstResult(r).attachments.splice(-1, 1, browserErrors({})); }],
]) {
  test(`rejects ${name}`, () => {
    const report = completeReport();
    mutate(report);
    assert.throws(() => assertBrowserMatrix(report));
  });
}

for (const required of requiredCases) {
  test(`rejects omission of ${required.title} in one Firefox touch project`, () => {
    const report = completeReport();
    const index = specs(report).findIndex((s) =>
      s.title === required.title && s.tests[0].projectName === 'firefox-mobile-canvas2d');
    specs(report).splice(index, 1);
    assert.throws(() => assertBrowserMatrix(report), /firefox-mobile-canvas2d: missing/);
  });
  for (const evidence of required.evidence) {
    test(`requires ${evidence} for ${required.title}`, () => {
      const report = completeReport();
      const result = specs(report).find((s) => s.title === required.title).tests[0].results[0];
      result.attachments = result.attachments.filter((a) => a.name !== evidence);
      assert.throws(() => assertBrowserMatrix(report), /missing evidence/);
    });
  }
}

test('reads file-backed error evidence and fails on fatal or missing files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pulse-matrix-'));
  try {
    const report = completeReport();
    const path = join(directory, 'browser-errors.json');
    firstResult(report).attachments.splice(-1, 1, {
      name: 'browser-errors', contentType: 'application/json', path,
    });
    writeFileSync(path, '[]');
    assert.doesNotThrow(() => assertBrowserMatrix(report));
    writeFileSync(path, '["Browser page crashed"]');
    assert.throws(() => assertBrowserMatrix(report), /fatal browser errors/);
    rmSync(path);
    assert.throws(() => assertBrowserMatrix(report), /ENOENT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
