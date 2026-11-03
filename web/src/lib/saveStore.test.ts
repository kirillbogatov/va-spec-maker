import { afterEach, describe, expect, it } from 'vitest';
import { reportSave, waitForSaves } from './saveStore';

afterEach(() => { reportSave('first', null); reportSave('second', null); });
describe('waitForSaves', () => {
  it('дожидается завершения всех автосохранений', async () => {
    reportSave('first', 'saving');
    reportSave('second', 'saving');
    let done = false;
    const waiting = waitForSaves().then(() => { done = true; });
    reportSave('first', 'saved');
    await Promise.resolve();
    expect(done).toBe(false);
    reportSave('second', 'saved');
    await waiting;
    expect(done).toBe(true);
  });
  it('отклоняет экспорт, если сохранение завершилось ошибкой', async () => {
    reportSave('first', 'saving');
    const waiting = expect(waitForSaves()).rejects.toThrow('ошибки сохранения');
    reportSave('first', 'error');
    await waiting;
  });
  it('сразу готов без правок и отклоняет уже существующую ошибку', async () => {
    await expect(waitForSaves()).resolves.toBeUndefined();
    reportSave('first', 'error');
    await expect(waitForSaves()).rejects.toThrow('ошибки сохранения');
  });
});
