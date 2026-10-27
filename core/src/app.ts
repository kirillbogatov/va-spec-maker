import type { Db } from './sqlite';
import { errorResponse, notFound } from './errors';
import { Res, type RouterT } from './router';
import { dependencyDictionaryRouter } from './routes/dependency-dictionary';
import { entitiesRouter } from './routes/entities';
import { exportRouter } from './routes/export';
import { intentsRouter } from './routes/intents';
import { keywordsRouter } from './routes/keywords';
import { projectsRouter } from './routes/projects';
import { promptsRouter } from './routes/prompts';
import { scenariosRouter } from './routes/scenarios';

export interface AppRequest { method: string; url: string; body?: unknown }
export interface AppResponse { status: number; headers: Record<string, string>; body: unknown }
export interface App { handle(r: AppRequest): Promise<AppResponse> }

export function createApp(db: Db): App {
  const routers: RouterT[] = [
    projectsRouter(db), entitiesRouter(db), intentsRouter(db), dependencyDictionaryRouter(db), keywordsRouter(db),
    promptsRouter(db), scenariosRouter(db), exportRouter(db),
  ];
  return {
    async handle({ method, url, body }) {
      const u = new URL(url, 'http://local');
      const path = u.pathname.replace(/^\/api/, '');
      const query = Object.fromEntries(u.searchParams);
      const clone = body === undefined ? undefined : JSON.parse(JSON.stringify(body));
      for (const r of routers) {
        for (const route of r.routes) {
          if (route.method !== method) continue;
          const m = route.re.exec(path);
          if (!m) continue;
          const params = Object.fromEntries(route.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
          const res = new Res();
          try {
            await route.handler({ params, query, body: clone }, res);
          } catch (e) {
            const er = errorResponse(e);
            return { status: er.status, headers: {}, body: er.body };
          }
          return { status: res.statusCode, headers: res.headers, body: res.payload };
        }
      }
      const er = errorResponse(notFound('Ресурс'));
      return { status: er.status, headers: {}, body: er.body };
    },
  };
}
