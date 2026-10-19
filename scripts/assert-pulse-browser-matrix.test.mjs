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

const jsonAttachment = (name, data) => ({
  name, contentType: 'application/json', body: Buffer.from(JSON.stringify(data)).toString('base64'),
});

function questAttachment(name, quest, engine, device, renderer) {
  const contextPolicy = renderer === 'canvas2d' ? 'injected-context-denial' : 'native';
  if (name === 'environment-capabilities') return jsonAttachment(name, {
    engine: engine ? 'firefox' : 'chromium', platform: 'linux', browserVersion: '157.0',
    contextPolicy, audio: { state: 'running', trustedGesture: true, start: 0, end: 0.1 },
  });
  if (name.startsWith('renderer-')) return jsonAttachment(name, {
    contextPolicy, canvases: [{
      kind: renderer === 'canvas2d' ? '2d' : 'webgl2', softwareCanvas: renderer === 'canvas2d',
      draws: 10, width: 375, height: 812, version: 'WebGL 2.0', lost: false, error: 0,
    }],
  });
  if (name === 'trusted-lane-input') return jsonAttachment(name, {
    expected: device === 'mobile' ? 'touch' : 'keyboard',
    events: [{ trusted: true, type: device === 'mobile' ? 'touch' : 'keyboard',
      code: device === 'mobile' ? 'pad-lane-0' : 'KeyD' }],
  });
  const attempts = quest.mode === 'access denied'
    ? [{ operation: 'access', key: null, denied: true }]
    : [{ operation: 'get', key: 'pulse-missions', denied: quest.mode === 'reads and writes denied' }];
  if (name === 'storage-failed-quest-saves' && quest.mode !== 'access denied') {
    attempts.push({ operation: 'set', key: 'pulse-missions', denied: true });
  }
  if (name === 'storage-repaired-quests') {
    attempts.push({ operation: 'set', key: 'pulse-missions', denied: false });
  }
  return jsonAttachment(name, {
    quests: name.startsWith('storage-repaired-quests') ? '{"version":1,"completed":["first-run"]}'
      : quest.raw ?? '{ "version": 1, "completed": [] }',
    attempts, effects: null, timing: null,
  });
}

function completeReport() {
  const specs = [];
  for (const engine of ['', 'firefox-']) {
    for (const device of ['desktop', 'mobile']) {
      for (const renderer of ['webgl2', 'canvas2d']) {
        for (const { file, title, evidence, quest } of requiredCases) {
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
                  ...[...new Set(['environment-capabilities', 'renderer-startup', ...evidence])]
                    .map((name) => quest ? questAttachment(name, quest, engine, device, renderer) : { name }),
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

test('accepts the complete 112-case core, persistence and quest matrix with evidence', () => {
  const report = completeReport();
  assert.equal(specs(report).length, 112);
  assert.doesNotThrow(() => assertBrowserMatrix(report));
});

for (const [name, mutate] of [
  ['previous 72-case release report', (r) => { r.suites[0].suites[0].specs = specs(r).filter((s) => !s.title.startsWith('storage faults:')); }],
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

for (const required of requiredCases.filter((item) => item.quest)) {
  for (const [name, mutate] of [
    ['skipped', (result) => { result.status = 'skipped'; }],
    ['retry', (result) => { result.retry = 1; }],
    ['fatal injected-storage error', (result) => {
      result.attachments.splice(-1, 1, browserErrors(['SecurityError: Browser storage access denied\n at MissionTracker.save']));
    }],
    ['missing renderer payload', (result) => {
      delete result.attachments.find((a) => a.name === 'renderer-startup').body;
    }],
    ['malformed storage payload', (result) => {
      result.attachments.find((a) => a.name === 'storage-quest-baseline').body = 'invalid';
    }],
    ['ambiguous storage payload', (result) => {
      result.attachments.push(result.attachments.find((a) => a.name === 'storage-quest-baseline'));
    }],
    ['changed stored bytes', (result) => {
      const name = required.quest.mode ? 'storage-unsaved-after-reload' : 'storage-damaged-quests';
      const a = result.attachments.find((a) => a.name === name);
      const data = JSON.parse(Buffer.from(a.body, 'base64').toString());
      data.quests = '{"version":1,"completed":["combo-20"]}';
      Object.assign(a, jsonAttachment(name, data));
    }],
    ['untrusted lane input', (result) => {
      const a = result.attachments.find((a) => a.name === 'trusted-lane-input');
      Object.assign(a, jsonAttachment(a.name, { expected: 'touch', events: [] }));
    }],
    ['incorrect renderer', (result) => {
      const a = result.attachments.find((a) => a.name === 'renderer-startup');
      const data = JSON.parse(Buffer.from(a.body, 'base64').toString());
      data.canvases[0].kind = 'webgl2';
      Object.assign(a, jsonAttachment(a.name, data));
    }],
  ]) {
    test(`rejects ${name}: ${required.title}`, () => {
      const report = completeReport();
      const result = specs(report).find((s) => s.title === required.title &&
        s.tests[0].projectName === 'firefox-mobile-canvas2d').tests[0].results[0];
      mutate(result);
      assert.throws(() => assertBrowserMatrix(report));
    });
  }
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
