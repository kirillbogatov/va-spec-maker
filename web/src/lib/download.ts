import type { AppResponse } from '@va/core';

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Имя берётся из Content-Disposition (filename*=UTF-8''...), иначе — запасное. */
export function downloadResponse(r: AppResponse, fallback: string): void {
  const m = /filename\*=UTF-8''([^;]+)/.exec(r.headers['content-disposition'] ?? '');
  const name = m ? decodeURIComponent(m[1]) : fallback;
  const text = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
  downloadBlob(r.body instanceof Blob ? r.body : new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
}
