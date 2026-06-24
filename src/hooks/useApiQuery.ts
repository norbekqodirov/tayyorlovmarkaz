/**
 * SWR-based data fetching hook — replaces useFirestore for CRM pages.
 *
 * Usage:
 *   const { data, isLoading, error, mutate } = useApiQuery<Student[]>('/students');
 *
 * Mutations (create / update / delete) come from useApiMutation or direct api calls
 * followed by mutate() to revalidate.
 */
import useSWR, { type SWRConfiguration, type KeyedMutator } from 'swr';
import api from '../api/client';

// ── Fetcher ──────────────────────────────────────────────────────────────────
const fetcher = (url: string) => api.get(url).then(r => r.data);

// ── Types ─────────────────────────────────────────────────────────────────────
export interface UseApiQueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | undefined;
  mutate: KeyedMutator<T>;
}

// ── Primary hook ──────────────────────────────────────────────────────────────
export function useApiQuery<T = unknown>(
  key: string | null,
  config?: SWRConfiguration<T>,
): UseApiQueryResult<T> {
  const { data, error, isLoading, mutate } = useSWR<T>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    errorRetryCount: 2,
    ...config,
  });

  return {
    data,
    isLoading,
    error: error as Error | undefined,
    mutate,
  };
}

// ── Mutation helpers ──────────────────────────────────────────────────────────
export function useApiMutation(cacheKey: string | null, mutate: KeyedMutator<unknown>) {
  const create = async (body: Record<string, unknown>) => {
    if (!cacheKey) return;
    const res = await api.post(cacheKey, body);
    await mutate();
    return res.data;
  };

  const update = async (id: string, body: Record<string, unknown>) => {
    if (!cacheKey) return;
    const res = await api.put(`${cacheKey}/${id}`, body);
    await mutate();
    return res.data;
  };

  const remove = async (id: string) => {
    if (!cacheKey) return;
    await api.delete(`${cacheKey}/${id}`);
    await mutate();
  };

  return { create, update, remove };
}

export default useApiQuery;
