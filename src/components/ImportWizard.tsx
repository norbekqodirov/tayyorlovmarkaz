import { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Check, X, AlertCircle, ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../api/client';

interface Props {
  collection: 'students' | 'staff' | 'leads';
  onClose: () => void;
  onSuccess: () => void;
}

const COLLECTION_LABELS: Record<string, string> = {
  students: "O'quvchilar",
  staff:    'Xodimlar',
  leads:    'Lidlar',
};

// Backend `preview` qatorlari: { original: {ustun: qiymat}, mapped: {field: qiymat} }
interface PreviewRow {
  original: Record<string, any>;
  mapped: Record<string, any>;
}

export default function ImportWizard({ collection, onClose, onSuccess }: Props) {
  const [step, setStep]             = useState<'upload' | 'preview' | 'done'>('upload');
  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<PreviewRow[]>([]);
  const [columns, setColumns]       = useState<string[]>([]);
  const [mapping, setMapping]       = useState<Record<string, string>>({});
  const [totalRows, setTotalRows]   = useState(0);
  const [errors, setErrors]         = useState<string[]>([]);
  const [canImport, setCanImport]   = useState(false);
  const [loading, setLoading]       = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [imported, setImported]     = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    if (!f) return;
    setFile(f);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', f);
      const res = await api.post(`/import/${collection}/preview`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const { preview: rows, columns: cols, detectedMapping, errors: errs, totalRows: total, canImport: ok } = res.data;
      setPreview(Array.isArray(rows) ? rows : []);
      setColumns(Array.isArray(cols) ? cols : []);
      setMapping(detectedMapping || {});
      setErrors(Array.isArray(errs) ? errs : []);
      setTotalRows(total ?? (Array.isArray(rows) ? rows.length : 0));
      setCanImport(Boolean(ok));
      setStep('preview');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Faylni o\'qishda xatolik');
    }
    setLoading(false);
  };

  const confirm = async () => {
    if (!file) return;
    setConfirming(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(mapping));
      const res = await api.post(`/import/${collection}/confirm`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImported(res.data.created ?? 0);
      setStep('done');
    } catch (err: any) {
      alert(err.response?.data?.message || 'Import qilishda xatolik');
    }
    setConfirming(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.csv'))) handleFile(f);
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="font-black text-slate-900 dark:text-white">
                {COLLECTION_LABELS[collection]} Import
              </h2>
              <div className="flex items-center gap-2 mt-1.5">
                {(['upload', 'preview', 'done'] as const).map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className={`w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center ${
                      step === s ? 'bg-blue-600 text-white' :
                      (i < (['upload','preview','done'] as const).indexOf(step)) ? 'bg-emerald-500 text-white' :
                      'bg-zinc-100 dark:bg-zinc-700 text-zinc-500'
                    }`}>
                      {i < (['upload','preview','done'] as const).indexOf(step) ? <Check size={9} /> : i + 1}
                    </span>
                    <span className={`text-xs font-bold ${step === s ? 'text-slate-900 dark:text-white' : 'text-zinc-400'}`}>
                      {s === 'upload' ? 'Fayl' : s === 'preview' ? "Ko'rish" : 'Tugadi'}
                    </span>
                    {i < 2 && <ChevronRight size={11} className="text-zinc-300" />}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
              <X size={16} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {step === 'upload' && (
              <div>
                <p className="text-sm text-zinc-500 mb-4">
                  Excel (.xlsx) yoki CSV formatda faylni yuklang.
                </p>
                <div
                  onDrop={onDrop}
                  onDragOver={e => e.preventDefault()}
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-zinc-300 dark:border-zinc-600 hover:border-blue-400 rounded-2xl p-10 text-center cursor-pointer transition-all group"
                >
                  <FileSpreadsheet size={40} className="text-zinc-300 dark:text-zinc-600 group-hover:text-blue-400 mx-auto mb-3 transition-colors" />
                  <p className="font-bold text-zinc-500 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
                    Faylni shu yerga tashlang yoki bosing
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">.xlsx, .csv • Maks 5MB</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                {loading && (
                  <div className="flex items-center justify-center gap-2 mt-4 text-sm text-blue-600">
                    <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    Faylni tahlil qilinmoqda...
                  </div>
                )}

                {/* Template download hint */}
                <div className="mt-5 p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-200 dark:border-blue-500/30">
                  <p className="text-xs font-bold text-blue-700 dark:text-blue-400 mb-1">Namuna fayl ustunlari:</p>
                  {collection === 'students' && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">Ism, Telefon, Tug'ilgan sana, Manzil, Ota-ona ismi, Ota-ona tel</p>
                  )}
                  {collection === 'staff' && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">Ism, Telefon, Lavozim, Bo'lim, Oylik</p>
                  )}
                  {collection === 'leads' && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-mono">Ism, Telefon, Manba, Kurs, Izoh</p>
                  )}
                </div>
              </div>
            )}

            {step === 'preview' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-500">
                    <span className="font-bold text-slate-900 dark:text-white">{totalRows}</span> ta yozuv topildi
                    {errors.length > 0 && <span className="text-rose-500 ml-2">({errors.length} ta ogohlantirish)</span>}
                  </p>
                  {file && <span className="text-xs text-zinc-400">{file.name}</span>}
                </div>

                {errors.length > 0 && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl border border-rose-200 dark:border-rose-500/30">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-rose-600 mb-1">
                      <AlertCircle size={13} /> {canImport ? 'Diqqat' : 'Import qilib bo\'lmaydi'}
                    </p>
                    {errors.slice(0, 3).map((e, i) => (
                      <p key={i} className="text-xs text-rose-500 ml-5">{typeof e === 'string' ? e : JSON.stringify(e)}</p>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-700 rounded-xl">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-zinc-50 dark:bg-zinc-800">
                        {columns.map(col => (
                          <th key={col} className="text-left px-3 py-2.5 font-bold text-zinc-500 uppercase border-b border-zinc-200 dark:border-zinc-700 whitespace-nowrap">
                            {col}{mapping[col] ? ` → ${mapping[col]}` : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          {columns.map(col => (
                            <td key={col} className="px-3 py-2 text-slate-900 dark:text-white whitespace-nowrap max-w-[200px] truncate">
                              {row.original?.[col] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalRows > preview.length && (
                  <p className="text-xs text-center text-zinc-400">va yana {totalRows - preview.length} ta yozuv...</p>
                )}
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-4">
                  <Check size={28} className="text-emerald-600" />
                </div>
                <h3 className="font-black text-lg text-slate-900 dark:text-white">Import muvaffaqiyatli!</h3>
                <p className="text-zinc-500 mt-1">
                  <span className="font-bold text-emerald-600">{imported}</span> ta yozuv import qilindi
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
            {step === 'upload' && (
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                Bekor
              </button>
            )}
            {step === 'preview' && (
              <>
                <button onClick={() => setStep('upload')} className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  ← Orqaga
                </button>
                <button
                  onClick={confirm}
                  disabled={confirming || !canImport || totalRows === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold"
                >
                  <Upload size={14} />
                  {confirming ? 'Yuklanmoqda...' : `${totalRows} ta import qilish`}
                </button>
              </>
            )}
            {step === 'done' && (
              <button
                onClick={() => { onSuccess(); onClose(); }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold"
              >
                Tayyor
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}
