import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertBrowserMatrix(report) {
  const projects = new Map();
  for (const engine of ['', 'firefox-', 'webkit-']) {
    for (const device of ['desktop', 'mobile']) {
      for (const renderer of ['webgl2', 'canvas2d']) {
        projects.set(`${engine}${device}-${renderer}`, []);
      }
    }
  }
  assert.deepEqual(report.errors ?? [], [], 'Playwright reported a global error');
  const visit = (suites) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          assert(projects.has(test.projectName), `Unexpected project ${test.projectName}`);
          assert.equal(test.expectedStatus, 'passed', `${test.projectName}: test must not be skipped or expected to fail`);
          assert.equal(test.results.length, 1, `${test.projectName}: retries cannot certify a clean run`);
          const result = test.results[0];
          assert.equal(result.status, 'passed', `${test.projectName}: ${spec.title} did not pass`);
          assert.deepEqual(result.errors ?? [], [], `${test.projectName}: assertion errors`);
          const attachments = new Set((result.attachments ?? []).map((item) => item.name));
          assert(attachments.has('environment-capabilities'), 'Missing native capability evidence');
          assert([...attachments].some((name) => name.startsWith('renderer-')), 'Missing renderer evidence');
          if (spec.title.startsWith('native-clock')) {
            assert(attachments.has('native-audio'), 'Missing native-clock audio evidence');
            assert(attachments.has('renderer-native-playing'), 'Missing native gameplay draw evidence');
          }
          if (spec.title.startsWith('real lane inputs')) {
            for (const name of ['trusted-lane-input', 'renderer-scoring', 'renderer-reload']) {
              assert(attachments.has(name), `Missing quest journey evidence: ${name}`);
            }
          }
          projects.get(test.projectName).push(spec.title);
        }
      }
      visit(suite.suites ?? []);
    }
  };
  visit(report.suites ?? []);
  for (const [project, titles] of projects) {
    assert.equal(new Set(titles).size, 4, `${project}: all four distinct journeys must run`);
    assert.equal(titles.length, 4, `${project}: unexpected case count`);
    for (const prefix of ['native-clock', 'real lane inputs', 'pause/resume', 'reduced-motion']) {
      assert(titles.some((title) => title.startsWith(prefix)), `${project}: missing ${prefix} journey`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertBrowserMatrix(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log('Release evidence complete: 48 passing cases, 12 projects, no skips or retries.');
}
