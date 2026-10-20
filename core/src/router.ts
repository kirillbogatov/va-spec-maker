export interface Req { params: Record<string, string>; query: Record<string, string>; body: any }

export class Res {
  statusCode = 200;
  headers: Record<string, string> = {};
  payload: unknown = undefined;
  status(c: number) { this.statusCode = c; return this; }
  json(b: unknown) { this.payload = b; return this; }
  send(b: unknown) { this.payload = b; return this; }
  type(t: string) { this.headers['content-type'] = t; return this; }
  setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; }
  end() { return this; }
}

export type Handler = (req: Req, res: Res) => void | Promise<void>;
export interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }
export interface RouterT {
  routes: Route[];
  get(p: string, h: Handler): void;
  post(p: string, h: Handler): void;
  put(p: string, h: Handler): void;
  patch(p: string, h: Handler): void;
  delete(p: string, h: Handler): void;
}

export function Router(): RouterT {
  const routes: Route[] = [];
  const add = (method: string) => (path: string, handler: Handler) => {
    const keys: string[] = [];
    const re = new RegExp('^' + path.replace(/:([A-Za-z]+)/g, (_m, k) => (keys.push(k), '([^/]+)')) + '/?$');
    routes.push({ method, re, keys, handler });
  };
  return { routes, get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') };
}
