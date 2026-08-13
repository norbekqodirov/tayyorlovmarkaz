/**
 * LeadFormModal.tsx
 * Add / Edit lead modal using the shared Modal + Button + Input UI components.
 */
import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { PhoneInput } from '../ui/PhoneInput';
import api from '../../api/client';
import { SOURCES, STAGES } from './types';
import type { Lead } from './types';

const GRADE_OPTIONS = [2, 3, 4, 5, 6];

interface Props {
  isOpen: boolean;
  editingLead: Lead | null;
  formData: Partial<Lead>;
  courses: any[];
  managers: { id: string; name: string }[];
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChange: (patch: Partial<Lead>) => void;
}

const LeadFormModal: React.FC<Props> = ({
  isOpen, editingLead, formData, courses, managers, saving, onClose, onSave, onChange,
}) => {
  const [extraField, setExtraField] = useState<{ type: 'none' | 'age' | 'grade'; label: string | null }>({ type: 'none', label: null });

  useEffect(() => {
    if (isOpen) {
      api.get('/public/lead-form-config').then(res => setExtraField(res.data)).catch(() => {});
    }
  }, [isOpen]);

  return (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title={editingLead ? 'Lidni Tahrirlash' : "Yangi Lid Qo'shish"}
    width="2xl"
  >
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <Input label="Ism Familiya" value={formData.name} onChange={e => onChange({ name: e.target.value })} placeholder="Masalan: Alisher Navoiy" />
        <PhoneInput label="Telefon" value={formData.phone || ''} onChange={phone => onChange({ phone })} />
      </div>

      <div className="space-y-1.5 flex flex-col gap-1.5">
        <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Kurs</label>
        <select
          value={formData.courseId || ''}
          onChange={e => {
            const course = courses.find((c: any) => c.id === e.target.value);
            onChange({ courseId: e.target.value || null, course: course?.name || '' });
          }}
          className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
        >
          <option value="">Kursni tanlang...</option>
          {courses.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {editingLead && (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-1.5 flex flex-col gap-1.5">
            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Bosqich</label>
            <select
              value={formData.stage}
              onChange={e => onChange({ stage: e.target.value as Lead['stage'] })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
            >
              {STAGES.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5 flex flex-col gap-1.5">
            <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Menejer</label>
            <select
              value={formData.assignedToId || ''}
              onChange={e => onChange({ assignedToId: e.target.value || null })}
              className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
            >
              <option value="">Egasiz</option>
              {managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-1.5 flex flex-col gap-1.5">
          <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Manba</label>
          <select
            value={formData.source}
            onChange={e => onChange({ source: e.target.value })}
            className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
          >
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="space-y-1.5 flex flex-col gap-1.5">
          <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Holat</label>
          <select
            value={formData.status}
            onChange={e => onChange({ status: e.target.value as Lead['status'] })}
            className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
          >
            <option value="hot">Issiq (Hot)</option>
            <option value="warm">Iliq (Warm)</option>
            <option value="cold">Sovuq (Cold)</option>
          </select>
        </div>
      </div>

      {extraField.type === 'age' && (
        <Input
          label={extraField.label || ''}
          type="number"
          value={formData.extraField || ''}
          onChange={e => onChange({ extraField: e.target.value })}
          placeholder="10"
        />
      )}

      {extraField.type === 'grade' && (
        <div className="space-y-1.5 flex flex-col gap-1.5">
          <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">{extraField.label}</label>
          <select
            value={formData.extraField || ''}
            onChange={e => onChange({ extraField: e.target.value })}
            className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium"
          >
            <option value="">Sinfni tanlang</option>
            {GRADE_OPTIONS.map(g => <option key={g} value={`${g}-sinf`}>{g}-sinf</option>)}
          </select>
        </div>
      )}

      <div className="space-y-1.5 flex flex-col gap-1.5">
        <label className="text-sm font-bold text-slate-700 dark:text-zinc-300">Eslatma</label>
        <textarea
          value={formData.notes}
          onChange={e => onChange({ notes: e.target.value })}
          className="w-full bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 font-medium resize-none"
          rows={3}
          placeholder="Lid haqida qo'shimcha ma'lumotlar..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
        <Button variant="secondary" onClick={onClose} type="button">Bekor qilish</Button>
        <Button variant="primary" onClick={onSave} type="button" isLoading={saving} leftIcon={<Check size={18} />}>Saqlash</Button>
      </div>
    </div>
  </Modal>
  );
};

export default LeadFormModal;
