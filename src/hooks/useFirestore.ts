/**
 * useFirestore.ts (Faza 0.4 — modernized)
 *
 * REST-backed data hook that mirrors Firestore-style API.
 * Improvements:
 *  - Optimistic local state updates (no refetch on add/update/delete)
 *  - Proper error boundary / toast-ready error surface
 *  - Returns `refetch` for manual refresh when needed
 */
import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

export function useFirestore<T extends Record<string, any>>(collectionName: string) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // ─── Fetch (initial load + manual refresh) ──────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/${collectionName}`);
      // Server may return { data: [], total, page } or flat array
      const raw = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
      setData(raw);
      setError(null);
    } catch (err: any) {
      console.error(`[useFirestore] fetch ${collectionName}:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Add (optimistic) ───────────────────────────────────────────────────────
  const addDocument = async (documentData: Omit<T, 'id'>): Promise<string> => {
    const res = await api.post(`/${collectionName}`, documentData);
    const created = res.data as T & { id: string };
    setData(prev => [created, ...prev]);
    return created.id;
  };

  // ─── Update (optimistic) ────────────────────────────────────────────────────
  const updateDocument = async (id: string, documentData: Partial<T>): Promise<void> => {
    const res = await api.put(`/${collectionName}/${id}`, documentData);
    const updated = res.data as T & { id: string };
    setData(prev => prev.map(d => d.id === id ? { ...d, ...updated } : d));
  };

  // ─── Delete (optimistic) ────────────────────────────────────────────────────
  const deleteDocument = async (id: string): Promise<void> => {
    await api.delete(`/${collectionName}/${id}`);
    setData(prev => prev.filter(d => d.id !== id));
  };

  return {
    data,
    documents: data,   // alias for legacy compatibility
    loading,
    error,
    addDocument,
    updateDocument,
    deleteDocument,
    refetch: fetchData,
  };
}
