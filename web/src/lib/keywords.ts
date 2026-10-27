import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { matchKeywords } from '@va/core';
import { api } from './api';
import type { Keyword } from './types';

/** Ключевые слова в UI показываются с префиксом «$»; в данных кода его нет. */
export const keywordLabel = (name: string) => `$${name}`;

export function useKeywords(projectId: number): Keyword[] {
  return useQuery({ queryKey: ['keywords', projectId], queryFn: () => api.keywords.list(projectId) }).data ?? [];
}

/** Функция «фраза → коды ключевых слов» по справочнику проекта. */
export function useKeywordMatcher(projectId: number): (phrase: string) => string[] {
  const keywords = useKeywords(projectId);
  return useMemo(() => (phrase: string) => matchKeywords(phrase, keywords), [keywords]);
}
