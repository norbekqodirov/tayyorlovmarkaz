import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

export function useFirestore<T>(collectionName: string) {
  const [data, setData] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/${collectionName}`);
      setData(res.data);
      setError(null);
    } catch (err: any) {
      console.error(`Error fetching ${collectionName}:`, err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addDocument = async (documentData: any) => {
    try {
      const res = await api.post(`/${collectionName}`, documentData);
      await fetchData(); // Refresh data
      return res.data.id;
    } catch (err) {
      console.error(`Error adding to ${collectionName}:`, err);
      throw err;
    }
  };

  const updateDocument = async (id: string, documentData: any) => {
    try {
      await api.put(`/${collectionName}/${id}`, documentData);
      await fetchData();
    } catch (err) {
      console.error(`Error updating ${collectionName}:`, err);
      throw err;
    }
  };

  const deleteDocument = async (id: string) => {
    try {
      await api.delete(`/${collectionName}/${id}`);
      await fetchData();
    } catch (err) {
      console.error(`Error deleting from ${collectionName}:`, err);
      throw err;
    }
  };

  return { data, documents: data, loading, error, addDocument, updateDocument, deleteDocument, refetch: fetchData };
}
