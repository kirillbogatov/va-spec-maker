export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} не найден`);
export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);

export function errorResponse(err: any): { status: number; body: unknown } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.code, message: err.message, details: err.details } };
  if (err?.code === 'SQLITE_CONSTRAINT_UNIQUE') return { status: 409, body: { error: 'duplicate', message: 'Элемент с таким названием уже существует' } };
  console.error(err);
  return { status: 500, body: { error: 'internal', message: 'Внутренняя ошибка' } };
}
