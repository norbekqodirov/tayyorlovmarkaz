import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import type { AxiosRequestConfig } from 'axios';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseApiListState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCrudReturn<T extends { id: string }> {
  items: T[];
  loading: boolean;
  error: string | null;
  create: (payload: Partial<T>) => Promise<T>;
  update: (id: string, payload: Partial<T>) => Promise<T>;
  remove: (id: string) => Promise<void>;
  refetch: () => void;
}

// ─── Generic GET (single object) ──────────────────────────────────────────────

export function useApiGet<T>(
  url: string,
  defaultValue: T,
  config?: AxiosRequestConfig
): UseApiState<T> & { refetch: () => void } {
  const [data, setData] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const fetch = useCallback(async () => {
    const id = ++counter.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(url, config);
      if (id === counter.current) setData(res.data);
    } catch (e: any) {
      if (id === counter.current)
        setError(e?.response?.data?.message ?? e.message ?? 'Xatolik yuz berdi');
    } finally {
      if (id === counter.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Generic GET (list) ────────────────────────────────────────────────────────

export function useApiList<T>(
  url: string,
  config?: AxiosRequestConfig
): UseApiListState<T> {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counter = useRef(0);

  const fetch = useCallback(async () => {
    const id = ++counter.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T[]>(url, config);
      if (id === counter.current) {
        // Handle both array responses and {data: [...]} envelopes
        const result = Array.isArray(res.data) ? res.data : (res.data as any).data ?? [];
        setData(result);
      }
    } catch (e: any) {
      if (id === counter.current)
        setError(e?.response?.data?.message ?? e.message ?? 'Xatolik yuz berdi');
    } finally {
      if (id === counter.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => { fetch(); }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

// ─── Generic CRUD hook ────────────────────────────────────────────────────────
/**
 * Full CRUD operations for a given API collection.
 *
 * Example:
 *   const { items, create, update, remove } = useCrud<Student>('/students');
 */
export function useCrud<T extends { id: string }>(
  collectionUrl: string
): UseCrudReturn<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T[]>(collectionUrl);
      const result = Array.isArray(res.data) ? res.data : (res.data as any).data ?? [];
      setItems(result);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e.message ?? 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  }, [collectionUrl]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const create = useCallback(async (payload: Partial<T>): Promise<T> => {
    const res = await api.post<T>(collectionUrl, payload);
    const created: T = (res.data as any).data ?? res.data;
    setItems(prev => [created, ...prev]);
    return created;
  }, [collectionUrl]);

  const update = useCallback(async (id: string, payload: Partial<T>): Promise<T> => {
    const res = await api.put<T>(`${collectionUrl}/${id}`, payload);
    const updated: T = (res.data as any).data ?? res.data;
    setItems(prev => prev.map(item => item.id === id ? updated : item));
    return updated;
  }, [collectionUrl]);

  const remove = useCallback(async (id: string): Promise<void> => {
    await api.delete(`${collectionUrl}/${id}`);
    setItems(prev => prev.filter(item => item.id !== id));
  }, [collectionUrl]);

  return { items, loading, error, create, update, remove, refetch: fetchAll };
}

// ─── Mutation hook (POST/PUT for one-off calls) ───────────────────────────────

interface UseMutationOptions<TRes> {
  onSuccess?: (data: TRes) => void;
  onError?: (error: string) => void;
}

export function useMutation<TReq = unknown, TRes = unknown>(
  method: 'post' | 'put' | 'patch' | 'delete',
  url: string,
  options?: UseMutationOptions<TRes>
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutate = useCallback(async (payload?: TReq): Promise<TRes | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await api[method]<TRes>(url, payload);
      const data = (res.data as any).data ?? res.data;
      options?.onSuccess?.(data);
      return data;
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e.message ?? 'Xatolik yuz berdi';
      setError(msg);
      options?.onError?.(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [method, url, options]);

  return { mutate, loading, error };
}
