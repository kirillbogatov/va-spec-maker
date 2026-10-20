import initSqlJs from 'sql.js';

export interface RunResult { changes: number; lastInsertRowid: number }
export interface Statement {
  get(...params: unknown[]): any;
  all(...params: unknown[]): any[];
  run(...params: unknown[]): RunResult;
}
export interface Db {
  prepare(sql: string): Statement;
  exec(sql: string): void;
  transaction<T>(fn: () => T): () => T;
  serialize(): Uint8Array;
}
export interface OpenOpts { data?: Uint8Array; locateFile?: (file: string) => string }

const bind = (params: unknown[]) => params.map((p) => (p === undefined ? null : p)) as (string | number | null)[];

/** sql.js бросает обычный Error; errorResponse ждёт код, как у better-sqlite3. */
function tagged(e: unknown): never {
  if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) (e as Error & { code?: string }).code = 'SQLITE_CONSTRAINT_UNIQUE';
  throw e;
}

export async function openSqlite(opts: OpenOpts = {}): Promise<Db> {
  const SQL = await initSqlJs(opts.locateFile ? { locateFile: opts.locateFile } : {});
  const raw = new SQL.Database(opts.data);
  raw.exec('PRAGMA foreign_keys = ON');
  let depth = 0;

  const query = (sql: string, params: unknown[], each: (row: Record<string, unknown>) => boolean) => {
    const st = raw.prepare(sql);
    try {
      st.bind(bind(params));
      while (st.step()) if (each(st.getAsObject())) break;
    } catch (e) {
      tagged(e);
    } finally {
      st.free();
    }
  };

  return {
    prepare: (sql) => ({
      get(...p) {
        let out: any;
        query(sql, p, (row) => ((out = row), true));
        return out;
      },
      all(...p) {
        const out: any[] = [];
        query(sql, p, (row) => (out.push(row), false));
        return out;
      },
      run(...p) {
        query(sql, p, () => false);
        const changes = raw.getRowsModified();
        const id = raw.exec('SELECT last_insert_rowid()')[0].values[0][0] as number;
        return { changes, lastInsertRowid: id };
      },
    }),
    exec: (sql) => { try { raw.exec(sql); } catch (e) { tagged(e); } },
    transaction: (fn) => () => {
      if (depth++ > 0) { try { return fn(); } finally { depth--; } }
      raw.exec('BEGIN');
      try {
        const r = fn();
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
    serialize: () => {
      const data = raw.export();
      raw.exec('PRAGMA foreign_keys = ON');
      return data;
    },
  };
}
