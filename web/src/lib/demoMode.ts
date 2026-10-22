import type { PublicUser } from '@/lib/auth';

/** Сборка live-демо: вход выполнен автоматически, данные живут только в текущей вкладке. */
export const DEMO = import.meta.env.VITE_DEMO === '1';

export const DEMO_USER: PublicUser = { id: 'demo', login: 'demo', role: 'user', createdAt: 0 };
