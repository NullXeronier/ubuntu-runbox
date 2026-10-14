import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBrowserMatrix } from './assert-pulse-browser-matrix.mjs';

function completeReport() {
  const specs = [];
  for (const engine of ['', 'firefox-', 'webkit-']) {
    for (const device of ['desktop', 'mobile']) {
      for (const renderer of ['webgl2', 'canvas2d']) {
        for (const title of ['native-clock startup', 'real lane inputs quest journey', 'pause/resume resets', 'reduced-motion settings']) {
          specs.push({
            title,
            tests: [{
              projectName: `${engine}${device}-${renderer}`,
              expectedStatus: 'passed',
              results: [{
                status: 'passed',
                errors: [],
                attachments: [
                  'environment-capabilities', 'renderer-native-playing', 'native-audio',
                  'trusted-lane-input', 'renderer-scoring', 'renderer-reload',
                ].map((name) => ({ name })),
              }],
            }],
          });
        }
      }
    }
  }
  return { errors: [], suites: [{ suites: [{ specs }] }] };
}

test('accepts only the complete passing matrix with evidence', () => {
  assert.doesNotThrow(() => assertBrowserMatrix(completeReport()));
});

for (const [name, mutate] of [
  ['omitted project', (r) => { r.suites[0].suites[0].specs.splice(0, 4); }],
  ['skipped test', (r) => { r.suites[0].suites[0].specs[0].tests[0].results[0].status = 'skipped'; }],
  ['expected failure', (r) => { r.suites[0].suites[0].specs[0].tests[0].expectedStatus = 'failed'; }],
  ['failed test', (r) => { r.suites[0].suites[0].specs[0].tests[0].results[0].status = 'failed'; }],
  ['missing evidence', (r) => { r.suites[0].suites[0].specs[0].tests[0].results[0].attachments = []; }],
  ['retry', (r) => { const t = r.suites[0].suites[0].specs[0].tests[0]; t.results.push(t.results[0]); }],
  ['global error', (r) => { r.errors.push({ message: 'browser setup failed' }); }],
]) {
  test(`rejects ${name}`, () => {
    const report = completeReport();
    mutate(report);
    assert.throws(() => assertBrowserMatrix(report));
  });
}
