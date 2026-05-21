import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Calendar, Check, Filter as FilterIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

export type FilterOption = { value: string; label: string; count?: number; color?: string };

export type Filter =
  | { type: 'select'; key: string; label: string; options: FilterOption[]; placeholder?: string }
  | { type: 'multiSelect'; key: string; label: string; options: FilterOption[] }
  | { type: 'dateRange'; key: string; label: string }
  | { type: 'pills'; key: string; label: string; options: FilterOption[] }
  | { type: 'toggle'; key: string; label: string };

export interface FilterPanelProps {
  filters: Filter[];
  value: Record<string, any>;
  onChange: (v: Record<string, any>) => void;
  onClear?: () => void;
  className?: string;
  collapsible?: boolean;
}

function SelectDropdown({
  label, options, value, onChange, placeholder,
}: {
  label: string;
  options: FilterOption[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
          value
            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
            : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
      >
        <span className="text-zinc-400 dark:text-zinc-500 font-medium">{label}:</span>
        <span className="font-black truncate max-w-[120px]">
          {selected?.label || placeholder || 'Barchasi'}
        </span>
        {value && (
          <X
            size={14}
            className="ml-1 hover:text-rose-500"
            onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
          />
        )}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full mt-2 min-w-[200px] max-h-80 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl py-2"
          >
            <button
              onClick={() => { onChange(undefined); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between ${
                !value ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              <span>Barchasi</span>
              {!value && <Check size={14} />}
            </button>
            {options.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between ${
                    isSelected ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-500/10' : 'text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {opt.color && <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />}
                    {opt.label}
                  </span>
                  <span className="flex items-center gap-2">
                    {typeof opt.count === 'number' && (
                      <span className="text-[10px] font-bold text-zinc-400 tabular-nums">{opt.count}</span>
                    )}
                    {isSelected && <Check size={14} />}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MultiSelectDropdown({
  label, options, value, onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter(x => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
          value.length > 0
            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
            : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
        }`}
      >
        <span className="text-zinc-400 font-medium">{label}:</span>
        <span className="font-black">
          {value.length > 0 ? `${value.length} ta` : 'Barchasi'}
        </span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full mt-2 min-w-[220px] max-h-80 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl py-2"
          >
            {options.map((opt) => {
              const isSelected = value.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  onClick={() => toggle(opt.value)}
                  className={`w-full text-left px-4 py-2 text-xs font-bold hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors flex items-center justify-between ${
                    isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-zinc-300'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center ${
                      isSelected ? 'bg-blue-500 border-blue-500' : 'border-zinc-300 dark:border-zinc-700'
                    }`}>
                      {isSelected && <Check size={10} className="text-white" strokeWidth={3} />}
                    </span>
                    {opt.label}
                  </span>
                  {typeof opt.count === 'number' && (
                    <span className="text-[10px] font-bold text-zinc-400 tabular-nums">{opt.count}</span>
                  )}
                </button>
              );
            })}
            {value.length > 0 && (
              <div className="border-t border-zinc-100 dark:border-zinc-800 mt-2 pt-2 px-3">
                <button
                  onClick={() => onChange([])}
                  className="w-full text-xs font-bold text-rose-500 hover:text-rose-600 py-1"
                >
                  Tozalash
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DateRangePicker({
  label, value, onChange,
}: {
  label: string;
  value: { from?: string; to?: string } | undefined;
  onChange: (v: { from?: string; to?: string } | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [local, setLocal] = useState({ from: value?.from || '', to: value?.to || '' });

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const apply = () => {
    if (!local.from && !local.to) onChange(undefined);
    else onChange({ from: local.from || undefined, to: local.to || undefined });
    setOpen(false);
  };

  const hasValue = !!(value?.from || value?.to);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
          hasValue
            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-500/30'
            : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
        }`}
      >
        <Calendar size={14} />
        <span className="text-zinc-400 font-medium">{label}:</span>
        <span className="font-black">
          {hasValue ? `${value?.from || '...'} → ${value?.to || '...'}` : 'Barchasi'}
        </span>
        {hasValue && (
          <X
            size={14}
            className="ml-1 hover:text-rose-500"
            onClick={(e) => { e.stopPropagation(); onChange(undefined); setLocal({ from: '', to: '' }); }}
          />
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute z-50 top-full mt-2 p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl"
          >
            <div className="grid grid-cols-1 gap-3 min-w-[240px]">
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Boshlanish</label>
                <input
                  type="date"
                  value={local.from}
                  onChange={(e) => setLocal(p => ({ ...p, from: e.target.value }))}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">Tugash</label>
                <input
                  type="date"
                  value={local.to}
                  onChange={(e) => setLocal(p => ({ ...p, to: e.target.value }))}
                  className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={apply}
                  className="flex-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-black transition-colors"
                >
                  Qo'llash
                </button>
                <button
                  onClick={() => { setLocal({ from: '', to: '' }); onChange(undefined); setOpen(false); }}
                  className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg text-xs font-black transition-colors"
                >
                  Tozalash
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Pills({
  label, options, value, onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-bold text-zinc-400 mr-1">{label}:</span>
      <button
        onClick={() => onChange(undefined)}
        className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${
          !value
            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
        }`}
      >
        Barchasi
      </button>
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-black transition-all ${
              isSelected
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            {opt.label}
            {typeof opt.count === 'number' && (
              <span className={`ml-1.5 text-[10px] ${isSelected ? 'text-white/70' : 'text-zinc-400'}`}>
                ({opt.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function FilterPanel({ filters, value, onChange, onClear, className = '', collapsible = false }: FilterPanelProps) {
  const [expanded, setExpanded] = useState(!collapsible);
  const activeCount = Object.entries(value).filter(([_, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'object' && v !== null) return v.from || v.to;
    return v !== undefined && v !== null && v !== '';
  }).length;

  const update = (key: string, v: any) => onChange({ ...value, [key]: v });

  if (collapsible && !expanded) {
    return (
      <div className={className}>
        <button
          onClick={() => setExpanded(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
        >
          <FilterIcon size={14} />
          Filtrlar
          {activeCount > 0 && (
            <span className="bg-blue-600 text-white px-1.5 py-0.5 rounded-full text-[10px]">{activeCount}</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      {filters.map((f) => {
        switch (f.type) {
          case 'select':
            return (
              <SelectDropdown
                key={f.key}
                label={f.label}
                options={f.options}
                value={value[f.key]}
                onChange={(v) => update(f.key, v)}
                placeholder={f.placeholder}
              />
            );
          case 'multiSelect':
            return (
              <MultiSelectDropdown
                key={f.key}
                label={f.label}
                options={f.options}
                value={Array.isArray(value[f.key]) ? value[f.key] : []}
                onChange={(v) => update(f.key, v)}
              />
            );
          case 'dateRange':
            return (
              <DateRangePicker
                key={f.key}
                label={f.label}
                value={value[f.key]}
                onChange={(v) => update(f.key, v)}
              />
            );
          case 'pills':
            return (
              <Pills
                key={f.key}
                label={f.label}
                options={f.options}
                value={value[f.key]}
                onChange={(v) => update(f.key, v)}
              />
            );
          case 'toggle':
            return (
              <button
                key={f.key}
                onClick={() => update(f.key, !value[f.key])}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${
                  value[f.key]
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300'
                }`}
              >
                <span className={`w-3 h-3 rounded-md border-2 flex items-center justify-center transition-colors ${
                  value[f.key] ? 'bg-white border-white' : 'border-zinc-300 dark:border-zinc-700'
                }`}>
                  {value[f.key] && <Check size={8} className="text-blue-600" strokeWidth={4} />}
                </span>
                {f.label}
              </button>
            );
          default:
            return null;
        }
      })}

      {activeCount > 0 && onClear && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
        >
          <X size={14} />
          Tozalash ({activeCount})
        </button>
      )}
    </div>
  );
}

export default FilterPanel;
