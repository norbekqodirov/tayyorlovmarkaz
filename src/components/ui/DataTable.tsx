import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, MoreVertical, Inbox } from 'lucide-react';
import Pagination from '../Pagination';
import { SkeletonTable } from '../Skeleton';

export type SortDirection = 'asc' | 'desc' | null;

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  accessor?: (row: T) => any;
  cell?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string | number;
  minWidth?: string | number;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  hidden?: boolean;
  sticky?: 'left' | 'right';
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  rowId?: (row: T) => string;
  loading?: boolean;
  selection?: {
    value: Set<string>;
    onChange: (s: Set<string>) => void;
  };
  pagination?: {
    page: number;
    pageSize: number;
    total?: number;
    onPageChange: (p: number) => void;
  } | 'auto' | false;
  density?: 'compact' | 'comfortable';
  emptyState?: React.ReactNode;
  emptyMessage?: string;
  onRowClick?: (row: T, index: number) => void;
  rowClassName?: (row: T, index: number) => string;
  className?: string;
  stickyHeader?: boolean;
  serverSide?: boolean;
  sortBy?: { column: string; direction: SortDirection };
  onSortChange?: (sort: { column: string; direction: SortDirection }) => void;
  toolbar?: React.ReactNode;
  rowActions?: (row: T, index: number) => React.ReactNode;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  rowId = (r: any) => r.id,
  loading = false,
  selection,
  pagination = 'auto',
  density = 'comfortable',
  emptyState,
  emptyMessage = "Hech qanday ma'lumot topilmadi",
  onRowClick,
  rowClassName,
  className = '',
  stickyHeader = true,
  serverSide = false,
  sortBy,
  onSortChange,
  toolbar,
  rowActions,
}: DataTableProps<T>) {
  const visibleColumns = columns.filter(c => !c.hidden);

  // Internal sort state (if no external)
  const [internalSort, setInternalSort] = useState<{ column: string; direction: SortDirection }>({
    column: '',
    direction: null,
  });
  const currentSort = sortBy || internalSort;

  // Internal pagination state
  const [internalPage, setInternalPage] = useState(1);
  const internalPageSize = 20;

  const handleSort = (columnId: string) => {
    const col = visibleColumns.find(c => c.id === columnId);
    if (!col?.sortable) return;
    let direction: SortDirection = 'asc';
    if (currentSort.column === columnId) {
      direction = currentSort.direction === 'asc' ? 'desc' : currentSort.direction === 'desc' ? null : 'asc';
    }
    const newSort = { column: direction ? columnId : '', direction };
    if (onSortChange) onSortChange(newSort);
    else setInternalSort(newSort);
  };

  // Sort data (client-side only)
  const sortedData = useMemo(() => {
    if (serverSide || !currentSort.column || !currentSort.direction) return data;
    const col = visibleColumns.find(c => c.id === currentSort.column);
    if (!col?.accessor) return data;
    const sorted = [...data].sort((a, b) => {
      const av = col.accessor!(a);
      const bv = col.accessor!(b);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      return String(av).localeCompare(String(bv), 'uz');
    });
    return currentSort.direction === 'desc' ? sorted.reverse() : sorted;
  }, [data, currentSort, visibleColumns, serverSide]);

  // Paginate (client-side only)
  const paginatedData = useMemo(() => {
    if (serverSide || pagination === false) return sortedData;
    if (pagination === 'auto') {
      const start = (internalPage - 1) * internalPageSize;
      return sortedData.slice(start, start + internalPageSize);
    }
    // External pagination — data already paginated
    return sortedData;
  }, [sortedData, internalPage, pagination, serverSide]);

  const totalForPagination = pagination === 'auto' || pagination === false
    ? sortedData.length
    : pagination?.total ?? sortedData.length;
  const currentPageForPagination = pagination === 'auto' || pagination === false ? internalPage : pagination?.page ?? 1;
  const pageSizeForPagination = pagination === 'auto' || pagination === false ? internalPageSize : pagination?.pageSize ?? 20;

  const onPageChange = (p: number) => {
    if (pagination === 'auto' || pagination === false) setInternalPage(p);
    else pagination?.onPageChange(p);
  };

  const allSelected = !!(selection && paginatedData.length > 0 && paginatedData.every(r => selection.value.has(rowId(r))));
  const someSelected = !!(selection && paginatedData.some(r => selection.value.has(rowId(r))));

  const toggleAll = () => {
    if (!selection) return;
    const next = new Set(selection.value);
    if (allSelected) {
      paginatedData.forEach(r => next.delete(rowId(r)));
    } else {
      paginatedData.forEach(r => next.add(rowId(r)));
    }
    selection.onChange(next);
  };

  const toggleRow = (id: string) => {
    if (!selection) return;
    const next = new Set(selection.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selection.onChange(next);
  };

  const rowPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3.5';
  const headerPad = density === 'compact' ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden ${className}`}>
      {toolbar && (
        <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          {toolbar}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className={`${stickyHeader ? 'sticky top-0' : ''} bg-zinc-50 dark:bg-zinc-900/80 backdrop-blur-sm z-10`}>
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              {selection && (
                <th className={`${headerPad} w-10`}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded text-blue-600 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
              )}
              {visibleColumns.map((col) => {
                const isSorted = currentSort.column === col.id;
                const SortIcon = !isSorted ? ChevronsUpDown : currentSort.direction === 'asc' ? ChevronUp : ChevronDown;
                return (
                  <th
                    key={col.id}
                    style={{ width: col.width, minWidth: col.minWidth }}
                    className={`${headerPad} text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-500
                      ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                      ${col.sortable ? 'cursor-pointer select-none hover:text-slate-700 dark:hover:text-zinc-300' : ''}
                      ${col.headerClassName || ''}`}
                    onClick={() => col.sortable && handleSort(col.id)}
                  >
                    <div className={`inline-flex items-center gap-1.5 ${col.align === 'right' ? 'justify-end' : col.align === 'center' ? 'justify-center' : ''}`}>
                      <span>{col.header}</span>
                      {col.sortable && (
                        <SortIcon size={12} className={isSorted ? 'text-blue-500' : 'text-zinc-300 dark:text-zinc-600'} />
                      )}
                    </div>
                  </th>
                );
              })}
              {rowActions && <th className={`${headerPad} w-10`}></th>}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={visibleColumns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0)} className="p-0">
                  <SkeletonTable rows={6} cols={visibleColumns.length} />
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selection ? 1 : 0) + (rowActions ? 1 : 0)} className="py-16">
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center text-center">
                      <Inbox size={36} className="text-zinc-300 dark:text-zinc-700 mb-3" />
                      <p className="text-sm font-bold text-zinc-400">{emptyMessage}</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => {
                const id = rowId(row);
                const isSelected = selection?.value.has(id);
                return (
                  <tr
                    key={id}
                    onClick={() => onRowClick?.(row, idx)}
                    className={`border-b border-zinc-100 dark:border-zinc-800/60 transition-colors group
                      ${onRowClick ? 'cursor-pointer' : ''}
                      ${isSelected ? 'bg-blue-50/50 dark:bg-blue-500/5' : 'hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30'}
                      ${rowClassName ? rowClassName(row, idx) : ''}`}
                  >
                    {selection && (
                      <td className={rowPad} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected || false}
                          onChange={() => toggleRow(id)}
                          className="w-4 h-4 rounded text-blue-600 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>
                    )}
                    {visibleColumns.map((col) => (
                      <td
                        key={col.id}
                        style={{ width: col.width, minWidth: col.minWidth }}
                        className={`${rowPad} text-sm font-medium text-slate-700 dark:text-zinc-300
                          ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                          ${col.className || ''}`}
                      >
                        {col.cell ? col.cell(row, idx) : col.accessor ? String(col.accessor(row) ?? '') : ''}
                      </td>
                    ))}
                    {rowActions && (
                      <td className={`${rowPad} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          {rowActions(row, idx)}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pagination !== false && !loading && totalForPagination > pageSizeForPagination && (
        <div className="border-t border-zinc-200 dark:border-zinc-800">
          <Pagination
            currentPage={currentPageForPagination}
            totalItems={totalForPagination}
            itemsPerPage={pageSizeForPagination}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}

export default DataTable;
