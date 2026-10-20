import { badRequest } from './errors';

export function parseId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Некорректный id');
  return n;
}

export function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw badRequest(`Поле «${field}» не может быть пустым`);
  return v.trim();
}

export const optString = (v: unknown): string => (typeof v === 'string' ? v : '');

export function cleanStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
}
