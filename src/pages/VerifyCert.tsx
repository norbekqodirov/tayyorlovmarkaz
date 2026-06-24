import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, ShieldCheck, AlertTriangle, Calendar, User, BookOpen, Award } from 'lucide-react';
import api from '../api/client';

interface VerifyResult {
  valid: boolean;
  revoked?: boolean;
  serialNumber?: string;
  studentName?: string;
  courseName?: string | null;
  templateName?: string;
  templateType?: string;
  issuedAt?: string;
  grade?: string | null;
  revokedAt?: string;
  revokedReason?: string;
  message?: string;
}

export default function VerifyCert() {
  const { serial } = useParams();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!serial) return;
    setLoading(true);
    api.get(`/certificates/verify/${serial}`)
      .then(r => setResult(r.data))
      .catch(err => setResult({ valid: false, message: err.response?.data?.message || 'Topilmadi' }))
      .finally(() => setLoading(false));
  }, [serial]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-bold text-zinc-500">Tekshirilmoqda...</p>
            </div>
          ) : result?.valid ? (
            <>
              <div className="bg-gradient-to-br from-emerald-500 to-green-600 px-8 py-8 text-white text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <CheckCircle2 size={40} strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-black tracking-tight">Sertifikat haqiqiy</h1>
                <p className="text-sm font-bold text-white/80 mt-2">Tasdiqlangan va o'zgartirilmagan</p>
              </div>
              <div className="p-6 space-y-4">
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Seriya raqami</p>
                  <p className="text-lg font-black font-mono text-slate-900 dark:text-white">{result.serialNumber}</p>
                </div>
                <div className="space-y-3">
                  {result.studentName && (
                    <div className="flex items-center gap-3 text-sm">
                      <User size={16} className="text-zinc-400" />
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Egasi</p>
                        <p className="font-black text-slate-900 dark:text-white">{result.studentName}</p>
                      </div>
                    </div>
                  )}
                  {result.courseName && (
                    <div className="flex items-center gap-3 text-sm">
                      <BookOpen size={16} className="text-zinc-400" />
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Kurs</p>
                        <p className="font-bold text-slate-700 dark:text-zinc-300">{result.courseName}</p>
                      </div>
                    </div>
                  )}
                  {result.grade && (
                    <div className="flex items-center gap-3 text-sm">
                      <Award size={16} className="text-zinc-400" />
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Baho</p>
                        <p className="font-black text-emerald-600 dark:text-emerald-400">{result.grade}</p>
                      </div>
                    </div>
                  )}
                  {result.issuedAt && (
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar size={16} className="text-zinc-400" />
                      <div>
                        <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Berilgan sana</p>
                        <p className="font-bold text-slate-700 dark:text-zinc-300">
                          {new Date(result.issuedAt).toLocaleDateString('uz-UZ', {
                            day: '2-digit', month: 'long', year: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2 text-xs font-bold text-zinc-400">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  Bu sertifikat ofitsial tizimimizdan tasdiqlangan
                </div>
              </div>
            </>
          ) : result?.revoked ? (
            <>
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 px-8 py-8 text-white text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <AlertTriangle size={40} strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-black tracking-tight">Bekor qilingan</h1>
                <p className="text-sm font-bold text-white/80 mt-2">Bu sertifikat endi yaroqsiz</p>
              </div>
              <div className="p-6 space-y-3">
                <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-2xl">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Seriya</p>
                  <p className="text-base font-black font-mono">{result.serialNumber}</p>
                </div>
                <p className="text-sm font-bold text-zinc-500">
                  Sabab: {result.revokedReason || 'Belgilanmagan'}
                </p>
                {result.revokedAt && (
                  <p className="text-xs font-medium text-zinc-400">
                    Bekor qilingan: {new Date(result.revokedAt).toLocaleDateString('uz-UZ')}
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="bg-gradient-to-br from-rose-500 to-red-600 px-8 py-8 text-white text-center">
                <div className="w-20 h-20 mx-auto mb-4 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                  <XCircle size={40} strokeWidth={2.5} />
                </div>
                <h1 className="text-2xl font-black tracking-tight">Topilmadi</h1>
                <p className="text-sm font-bold text-white/80 mt-2">Bu sertifikat ro'yxatda yo'q</p>
              </div>
              <div className="p-6 text-center">
                <p className="text-sm font-bold text-zinc-500">
                  {result?.message || `Seriya raqami "${serial}" tizimda topilmadi.`}
                </p>
                <p className="text-xs text-zinc-400 mt-3">
                  Iltimos, QR kod va seriya raqamini qaytadan tekshiring
                </p>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs font-bold text-white/40 mt-6">
          Tayyorlov Markaz CRM · Sertifikat Tekshirish Tizimi
        </p>
      </div>
    </div>
  );
}
