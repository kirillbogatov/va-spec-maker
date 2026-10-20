import type { App } from '../src/app';

/** Минимальная замена supertest: запросы идут в процессе, без HTTP. */
export function request(app: App) {
  const call = (method: string) => (url: string) => {
    let body: unknown;
    const p: any = {
      send(b: unknown) { body = b; return p; },
      buffer() { return p; },
      parse() { return p; },
      then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
        return app
          .handle({ method, url, body })
          .then(async (r) => {
            let out = r.body;
            if (out instanceof Blob) out = Buffer.from(await out.arrayBuffer());
            return { status: r.status, headers: r.headers, body: out, text: typeof out === 'string' ? out : JSON.stringify(out) };
          })
          .then(ok, fail);
      },
    };
    return p;
  };
  return { get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), delete: call('DELETE') };
}
