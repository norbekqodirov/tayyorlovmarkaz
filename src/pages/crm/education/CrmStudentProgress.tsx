import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, CheckCircle2, XCircle, Clock, FileDown, Award, BookOpen } from 'lucide-react';
import api from '../../../api/client';
import { ErrorState } from '../../../components/States';

export default function CrmStudentProgress() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => { if (id) load(); }, [id]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(`/progress/${id}`);
      setData(res.data);
    } catch (err: any) {
      setData(null);
      setError(err?.response?.data?.message || err?.message || 'Hisobotni yuklab bo\'lmadi');
    } finally {
      setLoading(false);
    }
  };

  const exportPDF = () => {
    const el = document.getElementById('progress-report');
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<html><head><title>O'quvchi Hisoboti</title><style>
      * { box-sizing: border-box; font-family: sans-serif; }
      body { margin: 20px; color: #111; }
      h1 { font-size: 20px; margin-bottom: 4px; }
      h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
      .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
      .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
      .label { font-size: 10px; color: #64748b; text-transform: uppercase; }
      .value { font-size: 22px; font-weight: 900; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #f1f5f9; }
      th { font-weight: 700; background: #f8fafc; }
      .green { color: #16a34a; } .red { color: #dc2626; } .amber { color: #d97706; }
    </style></head><body>`);
    win.document.write(el.innerHTML);
    win.document.write(`</body></html>`);
    win.document.close();
    win.print();
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !data) return (
    <div className="space-y-4">
      <button onClick={() => navigate('/crmtayyorlovmarkaz/students')} className="inline-flex items-center gap-1.5 text-sm font-bold text-zinc-500 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft size={16} /> O'quvchilarga qaytish
      </button>
      <ErrorState message={error || "O'quvchi hisoboti topilmadi"} onRetry={load} />
    </div>
  );

  const { student, attendance, certificates } = data;

  const assessmentItems: any[] = data.assessments?.items || [];
  const assessments = assessmentItems.filter((a) => a.type !== 'homework');
  const homework = assessmentItems
    .filter((a) => a.type === 'homework')
    .map((a) => ({ title: a.title || 'Uy vazifasi', dueDate: a.date, submittedAt: a.date, grade: a.score }));

  const testResults = (data.tests?.items || []).map((t: any) => {
    // t.maxScore (QuizAttempt'ning o'zida) — server/routes/quiz.ts POST /:id/start'da
    // savol ballari yig'indisidan hisoblanadi, t.score bilan BIR XIL shkala.
    // t.quiz.maxScore — Quiz shablonining nominal (admin belgilagan) qiymati,
    // savollar ballari yig'indisiga teng bo'lmasligi mumkin — faqat eski/
    // to'ldirilmagan yozuvlar uchun zaxira sifatida ishlatiladi.
    const maxScore = t.maxScore || t.quiz?.maxScore || 100;
    const score = maxScore > 0 ? Math.round(((t.score || 0) / maxScore) * 100) : 0;
    return {
      testName: t.quiz?.title || t.testName,
      date: t.startedAt ? new Date(t.startedAt).toLocaleDateString('uz-UZ') : '—',
      score,
    };
  });

  const payments = data.payments
    ? { paid: data.payments.totalPaid, debt: data.payments.pendingAmount, count: data.payments.count }
    : null;

  const attPct    = attendance?.total > 0 ? Math.round((attendance.present / attendance.total) * 100) : 0;
  const avgGrade  = data.assessments?.avgScore || 0;
  const testAvg   = testResults.length > 0
    ? Math.round(testResults.reduce((s: number, t: any) => s + (t.score || 0), 0) / testResults.length)
    : 0;
  const hwDone    = homework.filter((h: any) => h.grade !== null && h.grade !== undefined).length;
  const hwTotal   = homework.length;

  const attBreakdownMap: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400' },
    rose:    { bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-600 dark:text-rose-400' },
    amber:   { bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-600 dark:text-amber-400' },
    blue:    { bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-600 dark:text-blue-400' },
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/crmtayyorlovmarkaz/students')}
            className="p-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">{student?.name} — Progress Hisobot</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{student?.phone} · {student?.group || student?.enrollments?.[0]?.group?.name || 'Guruhsiz'}</p>
          </div>
        </div>
        <button onClick={exportPDF}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold shrink-0">
          <FileDown size={14} /> PDF Eksport
        </button>
      </div>

      <div id="progress-report" className="space-y-6">
        {/* Summary KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard
            label="Davomat"
            value={`${attPct}%`}
            sub={`${attendance?.present || 0}/${attendance?.total || 0} dars`}
            color={attPct >= 80 ? 'emerald' : attPct >= 60 ? 'amber' : 'rose'}
            icon={CheckCircle2}
          />
          <KpiCard
            label="O'rtacha baho"
            value={avgGrade > 0 ? `${avgGrade}` : '—'}
            sub={`${assessments?.length || 0} ta baholash`}
            color="blue"
            icon={TrendingUp}
          />
          <KpiCard
            label="Test natijasi"
            value={testAvg > 0 ? `${testAvg}%` : '—'}
            sub={`${testResults?.length || 0} ta test`}
            color="violet"
            icon={BookOpen}
          />
          <KpiCard
            label="Uy vazifasi"
            value={hwTotal > 0 ? `${hwDone}/${hwTotal}` : '—'}
            sub={hwTotal > 0 ? `${Math.round((hwDone / hwTotal) * 100)}% bajarildi` : 'Vazifalar yo\'q'}
            color="indigo"
            icon={Clock}
          />
        </div>

        {/* Attendance breakdown */}
        {attendance && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Davomat Tafsiloti</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Keldi',     value: attendance.present || 0, color: 'emerald' },
                { label: 'Kelmadi',   value: attendance.absent  || 0, color: 'rose'    },
                { label: 'Kech',      value: attendance.late    || 0, color: 'amber'   },
                { label: 'Sababli',   value: attendance.excused || 0, color: 'blue'    },
              ].map(item => {
                const cls = attBreakdownMap[item.color] || attBreakdownMap.blue;
                return (
                  <div key={item.label} className={`text-center p-3 rounded-xl ${cls.bg}`}>
                    <p className={`text-2xl font-black ${cls.text}`}>{item.value}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{item.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xs text-zinc-500 mb-1">
                <span>Davomat foizi</span>
                <span className="font-bold">{attPct}%</span>
              </div>
              <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    attPct >= 80 ? 'bg-emerald-500' : attPct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${attPct}%` }}
                />
              </div>
            </div>

            {/* Trend */}
            {attendance.monthlyTrend?.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-bold text-zinc-500 mb-2">Oylik trend</p>
                <div className="flex items-end gap-1 h-16">
                  {attendance.monthlyTrend.map((t: any, i: number) => {
                    const pct = t.total > 0 ? (t.present / t.total) * 100 : 0;
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${t.month}: ${Math.round(pct)}%`}>
                        <div
                          className={`w-full rounded-t-sm ${pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ height: `${Math.max(4, pct * 0.56)}px` }}
                        />
                        <span className="text-[9px] text-zinc-400">{t.month?.slice(5)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Grades */}
        {assessments?.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Baholar</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="text-left py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Sana</th>
                    <th className="text-left py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Guruh</th>
                    <th className="text-center py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Baho</th>
                    <th className="text-left py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Izoh</th>
                  </tr>
                </thead>
                <tbody>
                  {assessments.map((a: any, i: number) => (
                    <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                      <td className="py-2.5 px-2 text-zinc-600 dark:text-zinc-400">{a.date}</td>
                      <td className="py-2.5 px-2 text-slate-900 dark:text-white">{a.group?.name || a.groupName || '—'}</td>
                      <td className="py-2.5 px-2 text-center">
                        {(() => {
                          // Baholash endi 1-5 shkalada (maxScore:5), Test/Quiz'dan
                          // kelgan yozuvlar esa hali ham 0-100 (maxScore:100) —
                          // rang chegarasi shkaladan qat'i nazar to'g'ri bo'lishi
                          // uchun har doim foizga normallashtiriladi.
                          const max = Number(a.maxScore) || 100;
                          const pct = (Number(a.score) / max) * 100;
                          return (
                            <span className={`inline-block px-2 py-0.5 rounded-lg text-xs font-black ${
                              pct >= 80 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                              pct >= 60 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                              'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400'
                            }`}>
                              {a.score}{a.maxScore ? `/${a.maxScore}` : ''}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-2.5 px-2 text-zinc-500 text-xs">{a.notes || a.comment || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Test results */}
        {testResults?.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Test Natijalari</h2>
            <div className="space-y-2">
              {testResults.map((t: any, i: number) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex-1 text-sm text-slate-900 dark:text-white truncate">{t.testName || `Test ${i+1}`}</span>
                  <span className="text-xs text-zinc-500">{t.date}</span>
                  <div className="w-24 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${t.score >= 70 ? 'bg-emerald-500' : t.score >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                      style={{ width: `${t.score}%` }}
                    />
                  </div>
                  <span className={`text-sm font-black w-10 text-right ${t.score >= 70 ? 'text-emerald-600' : t.score >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                    {t.score}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Homework */}
        {homework?.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Uy Vazifalari</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    <th className="text-left py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Vazifa</th>
                    <th className="text-left py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Muddat</th>
                    <th className="text-center py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Holat</th>
                    <th className="text-center py-2 px-2 text-xs font-bold text-zinc-500 uppercase">Baho</th>
                  </tr>
                </thead>
                <tbody>
                  {homework.map((h: any, i: number) => {
                    const submitted = h.submittedAt != null;
                    const graded = h.grade != null;
                    return (
                      <tr key={i} className="border-b border-zinc-50 dark:border-zinc-800/50">
                        <td className="py-2.5 px-2 text-slate-900 dark:text-white">{h.title}</td>
                        <td className="py-2.5 px-2 text-zinc-500">{h.dueDate}</td>
                        <td className="py-2.5 px-2 text-center">
                          {graded ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                              <CheckCircle2 size={11} /> Baholandi
                            </span>
                          ) : submitted ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                              <Clock size={11} /> Topshirildi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-500">
                              <XCircle size={11} /> Topshirilmadi
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center font-black text-slate-900 dark:text-white">
                          {h.grade ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Certificates */}
        {certificates?.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">Sertifikatlar</h2>
            <div className="space-y-2">
              {certificates.map((c: any, i: number) => {
                const courseName = c.course?.name || c.courseName || 'Kurs';
                const dateStr = c.issuedAt ? (isNaN(Date.parse(c.issuedAt)) ? c.issuedAt : new Date(c.issuedAt).toLocaleDateString('uz-UZ')) : '—';
                return (
                  <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl">
                    <Award size={16} className="text-amber-600 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{courseName}</p>
                      <p className="text-xs text-zinc-500">{dateStr}</p>
                    </div>
                    <span className="text-xs font-mono text-zinc-400">{c.serialNumber}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Payments summary */}
        {payments && (
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
            <h2 className="font-black text-sm text-slate-900 dark:text-white mb-4">To'lovlar Xulosasi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl">
                <p className="text-lg font-black text-emerald-600">{((payments.paid || 0) / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-zinc-500">To'landi</p>
              </div>
              <div className="text-center p-3 bg-rose-50 dark:bg-rose-500/10 rounded-xl">
                <p className="text-lg font-black text-rose-600">{((payments.debt || 0) / 1000000).toFixed(1)}M</p>
                <p className="text-xs text-zinc-500">Qarzdorlik</p>
              </div>
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                <p className="text-lg font-black text-blue-600">{payments.count || 0}</p>
                <p className="text-xs text-zinc-500">Jami to'lov</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon: Icon }: any) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600',
    rose:    'bg-rose-50 dark:bg-rose-500/10 text-rose-600',
    amber:   'bg-amber-50 dark:bg-amber-500/10 text-amber-600',
    blue:    'bg-blue-50 dark:bg-blue-500/10 text-blue-600',
    violet:  'bg-violet-50 dark:bg-violet-500/10 text-violet-600',
    indigo:  'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600',
  };
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[color] || colorMap.blue}`}>
        <Icon size={16} />
      </div>
      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
      <p className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  );
}
