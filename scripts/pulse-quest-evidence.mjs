import assert from 'node:assert/strict';

/** Audit payloads, not just attachment labels, for every quest matrix cell. */
export function assertQuestEvidence(scenario, evidence, project) {
  const canvas = project.endsWith('-canvas2d');
  const touch = project.includes('mobile-');
  const policy = canvas ? 'injected-context-denial' : 'native';
  const environment = evidence.get('environment-capabilities');
  assert.equal(environment.platform, 'linux', `${project}: Linux evidence required`);
  assert.equal(environment.engine, project.startsWith('firefox-') ? 'firefox' : 'chromium');
  assert.equal(typeof environment.browserVersion, 'string');
  assert(environment.browserVersion.length > 0, 'Missing browser version');
  assert.equal(environment.contextPolicy, policy);
  assert.equal(environment.audio?.state, 'running');
  assert.equal(environment.audio?.trustedGesture, true);
  assert(environment.audio.end > environment.audio.start, 'Native audio clock must advance');

  const input = evidence.get('trusted-lane-input');
  assert.equal(input.expected, touch ? 'touch' : 'keyboard');
  assert(Array.isArray(input.events), 'Missing input events');
  assert(input.events.some((event) => event.trusted === true && (touch
    ? event.type === 'touch' && event.code?.startsWith('pad-lane-')
    : event.type === 'keyboard' && [
      'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight',
    ].includes(event.code))), 'Missing trusted lane input');

  for (const [name, data] of evidence) {
    if (name.startsWith('renderer-')) {
      assert.equal(data.contextPolicy, policy);
      assert.equal(data.canvases?.length, 1, `${name}: expected one renderer`);
      const rendered = data.canvases[0];
      assert.equal(rendered.kind, canvas ? '2d' : 'webgl2');
      assert(rendered.draws > 0 && rendered.width > 0 && rendered.height > 0, `${name}: no real draws`);
      assert.equal(rendered.softwareCanvas, canvas);
      if (!canvas) {
        assert.match(rendered.version, /WebGL 2\.0/);
        assert.equal(rendered.lost, false);
        assert.equal(rendered.error, 0);
      }
    }
    if (name.startsWith('storage-')) {
      assert.equal(typeof data.quests, 'string', `${name}: missing original/saved quest bytes`);
      assert(Array.isArray(data.attempts), `${name}: missing fault provenance`);
      for (const attempt of data.attempts) {
        assert(['access', 'get', 'set'].includes(attempt.operation));
        assert.equal(typeof attempt.denied, 'boolean');
        assert(attempt.key === null || typeof attempt.key === 'string');
      }
    }
  }
  const baseline = evidence.get('storage-quest-baseline');
  const questWrites = (data) => data.attempts.filter((a) => a.operation === 'set' && a.key === 'pulse-missions');
  assert.deepEqual(questWrites(baseline), [], 'No quest writes before completion');
  if (scenario.mode) {
    assert.deepEqual(JSON.parse(baseline.quests), { version: 1, completed: [] });
    for (const name of ['storage-quest-baseline', 'storage-failed-quest-saves', 'storage-unsaved-after-reload']) {
      const data = evidence.get(name);
      assert.equal(data.quests, baseline.quests, `${name}: denied storage changed original bytes`);
      if (scenario.mode === 'access denied') {
        assert(data.attempts.some((a) => a.operation === 'access' && a.denied), `${name}: no access denial`);
      } else {
        assert(data.attempts.some((a) => a.operation === 'get' && a.key === 'pulse-missions' &&
          a.denied === (scenario.mode === 'reads and writes denied')), `${name}: no expected quest read`);
      }
      assert(questWrites(data).every((a) => a.denied), `${name}: unexpected successful quest write`);
    }
    if (scenario.mode !== 'access denied') {
      assert(questWrites(evidence.get('storage-failed-quest-saves')).length > 0, 'No denied quest save attempt');
    }
  } else {
    for (const name of ['storage-quest-baseline', 'storage-damaged-quests']) {
      const data = evidence.get(name);
      assert.equal(data.quests, scenario.raw, `${name}: damaged bytes changed before completion`);
      assert.deepEqual(questWrites(data), [], `${name}: premature repair`);
    }
    const repaired = evidence.get('storage-repaired-quests');
    assert.deepEqual(JSON.parse(repaired.quests), { version: 1, completed: ['first-run'] });
    assert(questWrites(repaired).some((a) => !a.denied), 'No successful completion save');
    const reloaded = evidence.get('storage-repaired-quests-reload');
    assert.equal(reloaded.quests, repaired.quests, 'Repair did not survive reload');
    assert.deepEqual(questWrites(reloaded), [], 'Reload must not repair or award badges');
  }
}
