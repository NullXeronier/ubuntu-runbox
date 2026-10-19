import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Exact identities, not title prefixes or counts alone: a duplicated/substitute
// journey must never stand in for the damaged-record regression.
export const requiredCases = [
  {
    file: 'journey.spec.ts',
    title: 'native-clock renderer/audio startup and visible countdown reach gameplay',
    evidence: ['native-audio', 'renderer-native-playing'],
  },
  {
    file: 'journey.spec.ts',
    title: 'real lane inputs advance live quests; new badges become already earned after retry and survive reload',
    evidence: ['trusted-lane-input', 'renderer-scoring', 'renderer-reload'],
  },
  {
    file: 'journey.spec.ts',
    title: 'pause/resume freezes progress; restart/quit reset unfinished quests but keep earned badges',
    evidence: [],
  },
  {
    file: 'journey.spec.ts',
    title: 'reduced-motion default and explicit effects choice survive reload without changing renderers',
    evidence: [],
  },
  {
    file: 'best-persistence.spec.ts',
    title: 'personal best: legacy scores merge safely and a stale mirror cannot hide the committed best after reload',
    evidence: ['renderer-authoritative-best-reload'],
  },
  {
    file: 'best-persistence.spec.ts',
    title: 'personal best: a malformed authoritative record stays intact without leaking into other score buckets',
    evidence: ['trusted-lane-input', 'renderer-malformed-best-results', 'renderer-malformed-best-reload'],
  },
  ...['unavailable', 'open denied', 'write denied'].map((fault) => ({
    file: 'best-persistence.spec.ts',
    title: `personal best: IndexedDB ${fault} preserves existing scores and shows a save warning`,
    evidence: ['renderer-startup'],
  })),
];

function attachmentJSON(attachment) {
  assert.equal(attachment.contentType, 'application/json', 'Evidence must be JSON');
  if (typeof attachment.body === 'string') {
    return JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8'));
  }
  assert.equal(typeof attachment.path, 'string', 'Missing evidence body/path');
  // Playwright uses absolute paths for file attachments, or paths relative to
  // the runner working directory. Missing/unreadable files fail closed.
  return JSON.parse(readFileSync(resolve(attachment.path), 'utf8'));
}

export function assertBrowserMatrix(report) {
  const projects = new Map();
  for (const engine of ['', 'firefox-']) {
    for (const device of ['desktop', 'mobile']) {
      for (const renderer of ['webgl2', 'canvas2d']) {
        projects.set(`${engine}${device}-${renderer}`, new Set());
      }
    }
  }
  assert.deepEqual(report.errors ?? [], [], 'Playwright reported a global error');
  const visit = (suites) => {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) {
        const file = spec.file?.replaceAll('\\', '/').split('/').at(-1);
        const required = requiredCases.find((item) => item.file === file && item.title === spec.title);
        assert(required, `Unexpected case: ${file}: ${spec.title}`);
        for (const test of spec.tests ?? []) {
          const label = `${test.projectName}: ${spec.title}`;
          assert(projects.has(test.projectName), `Unexpected project ${test.projectName}`);
          assert.equal(test.expectedStatus, 'passed', `${label}: test must not be skipped or expected to fail`);
          assert.equal(test.status, 'expected', `${label}: unexpected/flaky/skipped outcome`);
          assert.equal(test.results.length, 1, `${label}: retries cannot certify a clean run`);
          const result = test.results[0];
          assert.equal(result.status, 'passed', `${label}: did not pass`);
          assert.equal(result.retry, 0, `${label}: retry cannot certify a clean run`);
          assert.equal(result.error, undefined, `${label}: assertion error`);
          assert.deepEqual(result.errors ?? [], [], `${label}: assertion errors`);
          const attachments = result.attachments ?? [];
          const names = new Set(attachments.map((item) => item.name));
          for (const name of ['environment-capabilities', 'browser-errors', ...required.evidence]) {
            assert(names.has(name), `${label}: missing evidence: ${name}`);
          }
          assert([...names].some((name) => name.startsWith('renderer-')), `${label}: missing renderer evidence`);
          const browserErrors = attachments.filter((item) => item.name === 'browser-errors');
          assert.equal(browserErrors.length, 1, `${label}: ambiguous browser error evidence`);
          assert.deepEqual(attachmentJSON(browserErrors[0]), [], `${label}: fatal browser errors`);
          const seen = projects.get(test.projectName);
          assert(!seen.has(required.title), `${label}: duplicate case`);
          seen.add(required.title);
        }
      }
      visit(suite.suites ?? []);
    }
  };
  visit(report.suites ?? []);
  for (const [project, titles] of projects) {
    for (const required of requiredCases) {
      assert(titles.has(required.title), `${project}: missing ${required.file}: ${required.title}`);
    }
    assert.equal(titles.size, requiredCases.length, `${project}: unexpected case count`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertBrowserMatrix(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  console.log(`Release evidence complete: ${requiredCases.length * 8} passing cases (${requiredCases.length} per project), 8 projects, no skips, retries or fatal browser errors. Safari/WebKit excluded by scope.`);
}
