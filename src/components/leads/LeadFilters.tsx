/**
 * LeadFilters.tsx
 * Mavjud ui/FilterPanel ustida qurilgan lid-filtrlari qatori.
 */
import { useEffect, useState } from 'react';
import { FilterPanel, type Filter } from '../ui/FilterPanel';
import api from '../../api/client';
import { STAGES, SOURCES } from './types';
import type { LeadFilters as LeadFiltersState } from '../../hooks/useLeads';

interface Props {
  filters: LeadFiltersState;
  onChange: (patch: Partial<LeadFiltersState>) => void;
  onClear: () => void;
  stageCounts: Record<string, number>;
  courses?: { id: string; name: string }[];
}

export default function LeadFilters({ filters, onChange, onClear, stageCounts, courses = [] }: Props) {
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [forms, setForms] = useState<{ id: string; title: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  // Haqiqiy ma'lumotlardagi manba/qo'shimcha-maydon qiymatlari — leadIntake.ts
  // kampaniyasiz target formalar uchun endi forma sarlavhasini manba sifatida
  // yozadi, shuning uchun statik SOURCES ro'yxati yetarli emas (yangi manbalar
  // shu ro'yxatda bo'lmasligi mumkin).
  const [facets, setFacets] = useState<{ sources: string[]; extraFields: string[] }>({ sources: [], extraFields: [] });

  useEffect(() => {
    api.get('/leads/assignable-users').then(res => setManagers(res.data || [])).catch(() => {});
    api.get('/forms').then(res => setForms(res.data?.data || res.data || [])).catch(() => {});
    api.get('/campaigns').then(res => setCampaigns(res.data?.data || res.data || [])).catch(() => {});
    api.get('/leads/meta/facets').then(res => setFacets(res.data || { sources: [], extraFields: [] })).catch(() => {});
  }, []);

  // Statik SOURCES doim ko'rinadi (hali lid tushmagan bo'lsa ham tanlash mumkin
  // bo'lishi uchun), haqiqiy ma'lumotlardagi qo'shimcha manbalar (forma nomlari
  // va h.k.) ustiga qo'shiladi.
  const sourceOptions = Array.from(new Set([...SOURCES, ...facets.sources]));

  const panelFilters: Filter[] = [
    {
      type: 'pills', key: 'stage', label: 'Bosqich',
      options: STAGES.map(s => ({ value: s.id, label: s.short, count: stageCounts[s.id] || 0 })),
    },
    {
      type: 'select', key: 'status', label: 'Holat',
      options: [
        { value: 'hot', label: 'Issiq' },
        { value: 'warm', label: 'Iliq' },
        { value: 'cold', label: 'Sovuq' },
      ],
    },
    {
      type: 'multiSelect', key: 'source', label: 'Manba',
      options: sourceOptions.map(s => ({ value: s, label: s })),
    },
    {
      type: 'select', key: 'assignedTo', label: 'Menejer',
      options: [
        { value: 'me', label: 'Mening lidlarim' },
        { value: 'unassigned', label: 'Egasiz' },
        ...managers.map(m => ({ value: m.id, label: m.name })),
      ],
    },
    {
      type: 'select', key: 'courseId', label: 'Kurs',
      options: courses.map((c: any) => ({ value: c.id, label: c.name })),
    },
    {
      type: 'select', key: 'formId', label: 'Forma',
      options: forms.map(f => ({ value: f.id, label: f.title })),
    },
    {
      type: 'select', key: 'campaignId', label: 'Kampaniya',
      options: campaigns.map(c => ({ value: c.id, label: c.name })),
    },
    ...(facets.extraFields.length > 0 ? [{
      type: 'multiSelect' as const, key: 'extraField', label: 'Sinf/Yosh',
      options: facets.extraFields.map(v => ({ value: v, label: v })),
    }] : []),
    { type: 'toggle', key: 'overdue', label: "Muddati o'tgan" },
    { type: 'toggle', key: 'unresponded', label: 'Javob berilmagan' },
  ];

  const panelValue = {
    stage: filters.stage?.[0],
    status: filters.status?.[0],
    source: filters.source || [],
    assignedTo: filters.assignedTo,
    courseId: filters.courseId,
    formId: filters.formId,
    campaignId: filters.campaignId,
    extraField: filters.extraField || [],
    overdue: filters.overdue || false,
    unresponded: filters.unresponded || false,
  };

  const handlePanelChange = (v: Record<string, any>) => {
    onChange({
      stage: v.stage ? [v.stage] : undefined,
      status: v.status ? [v.status] : undefined,
      source: v.source?.length ? v.source : undefined,
      assignedTo: v.assignedTo || undefined,
      courseId: v.courseId || undefined,
      formId: v.formId || undefined,
      campaignId: v.campaignId || undefined,
      extraField: v.extraField?.length ? v.extraField : undefined,
      overdue: v.overdue || undefined,
      unresponded: v.unresponded || undefined,
    });
  };

  return (
    <FilterPanel
      filters={panelFilters}
      value={panelValue}
      onChange={handlePanelChange}
      onClear={onClear}
    />
  );
}
