/**
 * useLeads.ts
 * Server-side filtr/saralash/sahifalash holatini boshqaradi va
 * GET /api/leads ni chaqiradi. useFirestore('leads') o'rniga FAQAT
 * CrmLeads.tsx sahifasida ishlatiladi — CrmBI/CrmDashboard/
 * GlobalSearch/CrmPredictions hali useFirestore('leads') orqali
 * ishlaydi (server/routes/leads.ts parametrsiz chaqirilganda hammasini
 * qaytaradi, shuning uchun ular tegilmagan holda ishlayveradi).
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import { useSocket } from './useSocket';
import type { Lead } from '../components/leads/types';

export interface LeadFilters {
  q?: string;
  stage?: string[];
  status?: string[];
  source?: string[];
  assignedTo?: string; // 'me' | 'unassigned' | userId
  campaignId?: string;
  formId?: string;
  from?: string;
  to?: string;
  overdue?: boolean;
  unresponded?: boolean;
  duplicates?: boolean;
  trashed?: boolean;
}

export interface LeadSort {
  column: 'createdAt' | 'score' | 'name' | 'nextFollowUpAt' | 'lastContactAt';
  dir: 'asc' | 'desc';
}

const DEFAULT_SORT: LeadSort = { column: 'createdAt', dir: 'desc' };

export function useLeads() {
  const [filters, setFilters] = useState<LeadFilters>({});
  const [sort, setSort] = useState<LeadSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(0); // 0 = kanban rejimi (hammasi, filtrlangan holda)
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Qidiruv uchun 300ms debounce
  const [qInput, setQInput] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters(f => ({ ...f, q: qInput || undefined }));
      setPage(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [qInput]);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        q: filters.q,
        stage: filters.stage?.join(','),
        status: filters.status?.join(','),
        source: filters.source?.join(','),
        assignedTo: filters.assignedTo,
        campaignId: filters.campaignId,
        formId: filters.formId,
        from: filters.from,
        to: filters.to,
        overdue: filters.overdue ? '1' : undefined,
        unresponded: filters.unresponded ? '1' : undefined,
        duplicates: filters.duplicates ? '1' : undefined,
        trashed: filters.trashed ? '1' : undefined,
        sort: sort.column,
        dir: sort.dir,
      };
      if (limit > 0) { params.page = page; params.limit = limit; }
      const res = await api.get('/leads', { params });
      setLeads(res.data?.data || []);
      setTotal(res.data?.total || 0);
      setStageCounts(res.data?.stageCounts || {});
      setError(null);
    } catch (err: any) {
      setError(err);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [filters, sort, page, limit]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Boshqa foydalanuvchi (yoki ommaviy forma) yangi lid yaratsa/yangilasa —
  // ro'yxat jonli yangilanadi. useSocket handlerni ref orqali saqlaydi,
  // shuning uchun fetchLeads eskirgan (stale) filtr bilan qolib ketmaydi.
  useSocket('lead:created', fetchLeads);
  useSocket('lead:updated', fetchLeads);
  useSocket('lead:assigned', fetchLeads);
  useSocket('lead:deleted', fetchLeads);

  const updateFilters = useCallback((patch: Partial<LeadFilters>) => {
    setFilters(f => ({ ...f, ...patch }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setQInput('');
    setPage(1);
  }, []);

  // Optimistik yangilanish (masalan Kanban drag) — server javobini kutmasdan
  // UI'ni darhol yangilaydi; xato bo'lsa chaqiruvchi refetch() bilan tuzatadi.
  const optimisticUpdate = useCallback((id: string, patch: Partial<Lead>) => {
    setLeads(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  return {
    leads, total, stageCounts, loading, error,
    filters, updateFilters, clearFilters,
    qInput, setQInput,
    sort, setSort,
    page, setPage, limit, setLimit,
    refetch: fetchLeads,
    optimisticUpdate,
  };
}
