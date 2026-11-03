import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';

async function setup() {
  const db = await openDb();
  const app = createApp(db);
  const call = async (method: string, url: string, body?: unknown) => {
    const result = await app.handle({ method, url, body });
    expect(result.status).toBeLessThan(300);
    return result.body as any;
  };
  const pid = (await call('POST', '/api/projects', { name: 'Readiness' })).id;
  const sid = (await call('POST', `/api/projects/${pid}/scenarios`, { name: 'Scenario' })).id;
  const id = (await call('POST', `/api/scenarios/${sid}/intents`, { name: 'INT_TEST' })).id;
  return { db, call, pid, sid, id };
}

describe('intent content readiness', () => {
  it('counts patterns separately in both lists and ignores blank stored patterns', async () => {
    const { db, call, pid, sid, id } = await setup();
    await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', values: [
      { kind: 'pattern', text: '$ON $LOCK', source: 'Turn on child lock' },
      { kind: 'pattern', text: '* lock *' },
      { kind: 'phrase', text: 'lock the door' },
    ] });
    db.prepare('INSERT INTO intent_patterns(intent_id, text) VALUES (?, ?)').run(id, '   ');
    for (const url of [`/api/projects/${pid}/intents`, `/api/scenarios/${sid}/intents`]) {
      expect((await call('GET', url))[0]).toMatchObject({ phrase_count: 1, pattern_count: 2 });
    }
  });

  it('accepts concepts without training phrases and rejects empty enabled intents', async () => {
    const { db, call, pid, sid, id } = await setup();
    db.prepare('UPDATE scenarios SET description = ? WHERE id = ?').run('Description', sid);
    db.prepare('INSERT INTO scenario_steps(scenario_id, state, next_states) VALUES (?, ?, ?)').run(sid, 'START', 'END');
    const ready = async () => (await call('GET', '/api/projects')).find((p: any) => p.id === pid).ready_count;
    await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', values: [
      { kind: 'pattern', text: '$ON $LOCK', source: 'Turn on child lock' },
    ] });
    expect(await ready()).toBe(1);
    for (const url of [`/api/projects/${pid}/intents`, `/api/scenarios/${sid}/intents`]) {
      expect((await call('GET', url))[0]).toMatchObject({ phrase_count: 0, pattern_count: 1 });
    }
    await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', values: [] });
    expect(await ready()).toBe(0);
    // Legacy/imported whitespace must not make a scenario ready.
    db.prepare('INSERT INTO intent_patterns(intent_id, text) VALUES (?, ?)').run(id, '   ');
    db.prepare('INSERT INTO intent_phrases(intent_id, text) VALUES (?, ?)').run(id, '   ');
    expect(await ready()).toBe(0);
    await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', phrases: ['lock the door'] });
    expect(await ready()).toBe(1);
    await call('PUT', `/api/intents/${id}`, { name: 'INT_TEST', enabled: false });
    expect(await ready()).toBe(1);
  });
});
