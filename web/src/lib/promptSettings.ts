import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { req } from './api';
import { toast } from 'sonner';
import { waitForSaves } from './saveStore';

const key = (pid: number) => ['prompt-settings', pid] as const;
export function usePromptSettings(pid: number) {
  return useQuery({ queryKey: key(pid), queryFn: () => req<{ splitAnswers: boolean }>('GET', `/api/projects/${pid}/prompt-settings`) });
}
export function useSplitPromptAnswers(pid: number) {
  return usePromptSettings(pid).data?.splitAnswers ?? false;
}
export function useSavePromptSettings(pid: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (splitAnswers: boolean) => {
      await waitForSaves();
      return req<{ splitAnswers: boolean }>('PUT', `/api/projects/${pid}/prompt-settings`, { splitAnswers });
    },
    onSuccess: async (settings) => {
      await qc.invalidateQueries({ predicate: q => q.queryKey[0] !== 'prompt-settings' });
      qc.setQueryData(key(pid), settings);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
