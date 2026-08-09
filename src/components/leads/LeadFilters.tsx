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
}

export default function LeadFilters({ filters, onChange, onClear, stageCounts }: Props) {
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    api.get('/leads/assignable-users').then(res => setManagers(res.data || [])).catch(() => {});
  }, []);

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
      options: SOURCES.map(s => ({ value: s, label: s })),
    },
    {
      type: 'select', key: 'assignedTo', label: 'Menejer',
      options: [
        { value: 'me', label: 'Mening lidlarim' },
        { value: 'unassigned', label: 'Egasiz' },
        ...managers.map(m => ({ value: m.id, label: m.name })),
      ],
    },
    { type: 'toggle', key: 'overdue', label: "Muddati o'tgan" },
    { type: 'toggle', key: 'unresponded', label: 'Javob berilmagan' },
  ];

  const panelValue = {
    stage: filters.stage?.[0],
    status: filters.status?.[0],
    source: filters.source || [],
    assignedTo: filters.assignedTo,
    overdue: filters.overdue || false,
    unresponded: filters.unresponded || false,
  };

  const handlePanelChange = (v: Record<string, any>) => {
    onChange({
      stage: v.stage ? [v.stage] : undefined,
      status: v.status ? [v.status] : undefined,
      source: v.source?.length ? v.source : undefined,
      assignedTo: v.assignedTo || undefined,
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
