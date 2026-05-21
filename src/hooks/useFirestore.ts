import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import { getSocket } from './useSocket';

interface UseFirestoreOptions {
  live?: boolean; // Auto-subscribe to WebSocket updates for this collection
  pageSize?: number;
}

export function useFirestore<T>(collectionName: string, options: UseFirestoreOptions = {}) {
  const { live = true } = options;
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/${collectionName}`);
      const payload = Array.isArray(res.data) ? res.data : res.data?.data || [];
      if (mountedRef.current) {
        setData(payload);
        setError(null);
      }
    } catch (err: any) {
      console.error(`Error fetching ${collectionName}:`, err);
      if (mountedRef.current) setError(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [collectionName]);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData]);

  // WebSocket live updates: merge in real-time without full refetch
  useEffect(() => {
    if (!live) return;
    let sock: ReturnType<typeof getSocket> | null = null;
    try {
      sock = getSocket();
    } catch {
      return;
    }
    if (!sock) return;

    const handleCreate = (newItem: any) => {
      if (!newItem?.id) return;
      setData(prev => {
        if (prev.some((x: any) => x.id === newItem.id)) return prev;
        return [newItem, ...prev];
      });
    };
    const handleUpdate = (updated: any) => {
      if (!updated?.id) return;
      setData(prev => prev.map((x: any) => x.id === updated.id ? { ...x, ...updated } : x));
    };
    const handleDelete = (payload: any) => {
      const id = payload?.id;
      if (!id) return;
      setData(prev => prev.filter((x: any) => x.id !== id));
    };

    sock.on(`${collectionName}:created`, handleCreate);
    sock.on(`${collectionName}:updated`, handleUpdate);
    sock.on(`${collectionName}:deleted`, handleDelete);
    return () => {
      sock?.off(`${collectionName}:created`, handleCreate);
      sock?.off(`${collectionName}:updated`, handleUpdate);
      sock?.off(`${collectionName}:deleted`, handleDelete);
    };
  }, [collectionName, live]);

  const addDocument = async (documentData: any) => {
    try {
      const res = await api.post(`/${collectionName}`, documentData);
      // No refetch needed — WebSocket will deliver `:created` event.
      // But also do optimistic local insert in case socket lags.
      if (res.data?.id) {
        setData(prev => prev.some((x: any) => x.id === res.data.id) ? prev : [res.data, ...prev]);
      }
      return res.data.id;
    } catch (err) {
      console.error(`Error adding to ${collectionName}:`, err);
      throw err;
    }
  };

  const updateDocument = async (id: string, documentData: any) => {
    try {
      const res = await api.put(`/${collectionName}/${id}`, documentData);
      // Optimistic update
      setData(prev => prev.map((x: any) => x.id === id ? { ...x, ...res.data } : x));
    } catch (err) {
      console.error(`Error updating ${collectionName}:`, err);
      throw err;
    }
  };

  const deleteDocument = async (id: string) => {
    try {
      await api.delete(`/${collectionName}/${id}`);
      // Optimistic remove
      setData(prev => prev.filter((x: any) => x.id !== id));
    } catch (err) {
      console.error(`Error deleting from ${collectionName}:`, err);
      throw err;
    }
  };

  return {
    data,
    documents: data,
    loading,
    error,
    addDocument,
    updateDocument,
    deleteDocument,
    refetch: fetchData,
  };
}
