import { openDb } from './db';
import { dumpProject } from './project-dump';
import type { OpenOpts } from './sqlite';
import { parseL3 } from './l3/parse';

const clean = (s = '') => s.trim().replace(/^[-–—]$/, '');
const nameOf = (s = '') => clean(s).replace(/^\[([^\]]+)\]$/, '$1');
const lines = (s = '') => clean(s).split('\n').map(s => s.replace(/^\s*(?:\d+[.)]|[•*-])\s*/, '').trim()).filter(Boolean);

/** Reads the public specification tables; text outside supported tables is retained in the description. */
export async function convertScenarioDocument(text: string, filename: string, opts: OpenOpts = {}) {
  const doc = parseL3(text, filename);
  const db = await openDb(opts);
  db.prepare('INSERT INTO projects(name) VALUES (?)').run(doc.title);
  const warnings: string[] = [];
  for (const section of doc.sections.filter(s => s.blocks.length)) {
    const sid = db.prepare('INSERT INTO scenarios(project_id,name) VALUES (1,?)').run(section.title).lastInsertRowid;
    let part = db.prepare('INSERT INTO scenario_parts(scenario_id,name) VALUES (?,?)').run(sid, section.title).lastInsertRowid;
    const intentIds = new Map<string, number>();
    const promptIds = new Map<string, number>();
    const entityIds = new Map<string, number>();
    const extra: string[] = [];
    let heading = '';
    let recognized = 0;
    const changelogHasDate = db.prepare('PRAGMA table_info(scenario_changelog)').all().some(c => c.name === 'date');
    const stateHasCode = db.prepare('PRAGMA table_info(scenario_states)').all().some(c => c.name === 'result_code');
    const promptHasShort = db.prepare('PRAGMA table_info(prompts)').all().some(c => c.name === 'short_answers');
    const tables: { head: string[]; rows: string[][]; heading: string; part: number }[] = [];
    for (const block of section.blocks) {
      if (block.kind === 'heading') {
        heading = block.text;
        if (block.level >= 3) part = db.prepare('INSERT INTO scenario_parts(scenario_id,name) VALUES (?,?)').run(sid, heading).lastInsertRowid;
      } else if (block.kind === 'text') {
        if (/режим|operating mode/i.test(heading)) db.prepare('UPDATE scenarios SET mode = ? WHERE id = ?').run(/только online|online only/i.test(block.text) ? 'online' : 'online_offline', sid);
        else if (/диаграмм|diagram/i.test(heading)) db.prepare('UPDATE scenarios SET diagram_url = ? WHERE id = ?').run(block.text,sid);
        else extra.push(block.text);
      }
      else tables.push({ head: block.rows[0]?.map(s => s.toLowerCase()) ?? [], rows: block.rows.slice(1), heading, part });
    }
    const getObject = (table: string, name: string, map: Map<string, number>) => {
      if (map.has(name)) return map.get(name)!;
      const old = db.prepare(`SELECT id FROM ${table} WHERE project_id = 1 AND name = ?`).get(name);
      const id = old?.id ?? db.prepare(`INSERT INTO ${table}(project_id,name) VALUES (1,?)`).run(name).lastInsertRowid;
      map.set(name, id);
      if (table === 'intents') db.prepare('INSERT OR IGNORE INTO scenario_intents(scenario_id,intent_id,is_global) VALUES (?,?,1)').run(sid,id);
      if (table === 'prompts') db.prepare('INSERT OR IGNORE INTO scenario_prompts(scenario_id,prompt_id) VALUES (?,?)').run(sid,id);
      return id;
    };
    // Definitions first so transition references work regardless of the document's section order.
    for (const t of tables) {
      const at = (re: RegExp) => t.head.findIndex(h => re.test(h));
      if (/^(интент|intent)/.test(t.head[0] ?? '')) {
        recognized++;
        for (const row of t.rows) {
          if (!clean(row[0])) continue;
          const id = getObject('intents', nameOf(row[0]), intentIds);
          for (const [re, table] of [[/фраз|utterance|phrase|training/, 'intent_phrases'], [/паттерн|pattern|концепт|concept|ключев|keyword/, 'intent_patterns']] as const) {
            lines(row[at(re)]).forEach((s, pos) => db.prepare(`INSERT INTO ${table}(intent_id,text,position) VALUES (?,?,?)`).run(id,s,pos));
          }
        }
      } else if (/^(промпт|prompt)/.test(t.head[0] ?? '')) {
        recognized++;
        for (const row of t.rows) {
          if (!clean(row[0])) continue;
          const id = getObject('prompts', nameOf(row[0]), promptIds);
          const full = at(/полный|full|response/);
          db.prepare('UPDATE prompts SET full_answers = ? WHERE id = ?').run(JSON.stringify(lines(row[full < 0 ? 1 : full])), id);
          if (promptHasShort) db.prepare('UPDATE prompts SET short_answers = ? WHERE id = ?').run(JSON.stringify(lines(row[at(/короткий|short/)])),id);
        }
      } else if (/^(зависимость|dependency)/.test(t.head[0] ?? '')) {
        recognized++;
        for (const [position, row] of t.rows.entries()) {
          const name = nameOf(row[0]);
          if (!name) continue;
          const values = lines(row[at(/значен|values/)]);
          const description = clean(row[at(/описан|description/)]);
          db.prepare('INSERT INTO scenario_dependencies(scenario_id,position,ref,name,type,options,description) VALUES (?,?,?,?,?,?,?)').run(
            sid, position, `imported-dependency-${position}`, name, values.length ? 'enum' : 'string', JSON.stringify(values), description,
          );
        }
      } else if (/^(сущност|entity|parameter)/.test(t.head[0] ?? '')) {
        recognized++;
        for (const row of t.rows) {
          if (!clean(row[0])) continue;
          const id = getObject('entities', nameOf(row[0]), entityIds);
          const type = /number|число/i.test(row[1] ?? '') ? 'number' : /boolean|логическ/i.test(row[1] ?? '') ? 'boolean' : /date|дата/i.test(row[1] ?? '') ? 'date' : /time|время/i.test(row[1] ?? '') ? 'time' : 'string';
          db.prepare('UPDATE entities SET type = ?, multiple_values = ? WHERE id = ?').run(type, /^(да|yes|true)$/i.test(row[at(/несколько|multiple/)] ?? '') ? 1 : 0, id);
          db.prepare('INSERT OR IGNORE INTO scenario_entities(scenario_id,entity_id,followup_prompt) VALUES (?,?,?)').run(sid,id,clean(row[at(/уточня|follow/)]));
          lines(row[at(/значен|values/)]).forEach((v,pos) => {
            const [value, ...rest] = v.split(':');
            db.prepare('INSERT INTO entity_values(entity_id,value,synonyms,position) VALUES (?,?,?,?)').run(id,nameOf(value),JSON.stringify(rest.join(':').split(',').map(s => s.trim().replace(/^"|"$/g,'')).filter(Boolean)),pos);
          });
        }
      }
    }
    for (const t of tables) {
      const at = (re: RegExp) => t.head.findIndex(h => re.test(h));
      const from = at(/^из состояния|^from state|^state$/);
      const to = at(/^в состояние|^to state|^next state/);
      if (/журнал|история измен|change.*(log|history)/i.test(t.heading)) {
        recognized++;
        for (const [pos,row] of t.rows.entries()) {
          const task = clean(row[at(/задач|task|ticket/)]), author = clean(row[at(/автор|author/)]), description = clean(row[at(/описан|description/)]);
          if (changelogHasDate) db.prepare('INSERT INTO scenario_changelog(scenario_id,position,date,task,author,description) VALUES (?,?,?,?,?,?)').run(sid,pos,clean(row[at(/дата|date/)]),task,author,description);
          else db.prepare('INSERT INTO scenario_changelog(scenario_id,position,task,author,description) VALUES (?,?,?,?,?)').run(sid,pos,task,author,description);
        }
        continue;
      }
      if (from < 0 && to < 0) {
        if (!/^(интент|intent|промпт|prompt|сущност|entity|parameter)/.test(t.head[0] ?? '')) {
          extra.push([t.head, ...t.rows].map(r => r.join(' | ')).join('\n'));
          warnings.push(`«${section.title}»: таблица «${t.heading || t.head.join(', ')}» сохранена в описании.`);
        }
        continue;
      }
      recognized++;
      for (const [position,row] of t.rows.entries()) {
        const error = /ошиб|error/i.test(t.heading);
        const global = /глобаль|global/i.test(t.heading);
        const request = lines(row[at(/запрос|user request|intent/)]);
        const intent = request.shift() ?? '';
        const iid = intent ? getObject('intents', nameOf(intent), intentIds) : null;
        const prompt = nameOf(row[at(/ответ ассистента|assistant response|prompt/)]);
        const prid = prompt ? getObject('prompts', prompt, promptIds) : null;
        const target = clean(row[to]);
        const code = clean(row[at(/result code/)]);
        if (code && stateHasCode) db.prepare('INSERT OR IGNORE INTO result_codes(project_id,name) VALUES (1,?)').run(code);
        if (target) {
          for (const state of target.split(/[,\n]+/).map(s => s.trim()).filter(Boolean)) {
            db.prepare('INSERT OR IGNORE INTO scenario_states(scenario_id,part_id,name) VALUES (?,?,?)').run(sid,t.part,state);
            db.prepare('UPDATE scenario_states SET prompt_id = ?, system_action = ? WHERE part_id = ? AND name = ?').run(prid,clean(row[at(/действие|system action|business logic/)]),t.part,state);
            if (stateHasCode) db.prepare('UPDATE scenario_states SET result_code = ? WHERE part_id = ? AND name = ?').run(code,t.part,state);
          }
        }
        db.prepare('INSERT INTO scenario_steps(scenario_id,part_id,position,kind,state,next_states,intent_id,prompt_id,request_params,condition,system_action) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(sid,t.part,position,error ? 'error' : global ? 'global' : 'transition',global ? '' : clean(row[from]),target,iid,error ? prid : null,request.join('\n'),clean(row[at(/услов|condition/)]),error ? clean(row[at(/действие|system action|business logic/)]) : '');
      }
    }
    // Attach entity references named in intent definitions.
    for (const t of tables.filter(t => /^(интент|intent)/.test(t.head[0] ?? ''))) {
      const col = t.head.findIndex(h => /сущност|entit|parameter/.test(h));
      for (const row of t.rows) for (const ref of lines(row[col])) {
        const name = nameOf(ref.replace(/\s*\((?:обязательно|required)\)$/, ''));
        const eid = getObject('entities',name,entityIds);
        const iid = intentIds.get(nameOf(row[0]));
        if (iid) db.prepare('INSERT OR IGNORE INTO intent_entities(intent_id,entity_id,required) VALUES (?,?,?)').run(iid,eid,/обязательно|required/.test(ref) ? 1 : 0);
      }
    }
    if (!recognized) warnings.push(`«${section.title}»: таблицы спецификации не распознаны; документ сохранён в описании.`);
    db.prepare('UPDATE scenarios SET description = ? WHERE id = ?').run(extra.join('\n\n'),sid);
  }
  const dump = dumpProject(db,1);
  if (!dump.tables.scenarios.length) throw new Error('Документ пуст: сценарии не найдены.');
  warnings.push('Документ не содержит внутренних ID. Проверьте условия переходов и связи после импорта; условия сохранены текстом.');
  return { dump, warnings };
}
