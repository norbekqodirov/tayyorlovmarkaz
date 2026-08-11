import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { PhoneInput } from '../../components/ui/PhoneInput';

export default function CrmLogin() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanPhone = phone.trim();
    if (!cleanPhone) {
      setError('Telefon raqamni kiriting');
      return;
    }
    if (!password) {
      setError("Parol kiritilishi shart");
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/login', { phone: cleanPhone, password });
      if (response.data.token) {
        localStorage.setItem('crm_token', response.data.token);
        localStorage.setItem('crm_user', JSON.stringify(response.data.user));
        navigate('/crmtayyorlovmarkaz');
      }
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(msg || 'Tizimga ulanishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-zinc-900 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-700 rounded-3xl mx-auto flex items-center justify-center mb-5 shadow-2xl shadow-blue-600/30">
            <Lock className="text-white" size={36} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Tayyorlov CRM</h1>
          <p className="text-sm text-zinc-400 mt-2 font-medium">O'quv markaz boshqaruv tizimi</p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-3xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-8">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 p-3.5 rounded-2xl text-sm font-medium text-center border border-rose-200 dark:border-rose-800/50">
                {error}
              </div>
            )}

            {/* Phone */}
            <PhoneInput
              label="Telefon raqam"
              value={phone}
              onChange={setPhone}
              required
            />

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-sm font-black text-slate-700 dark:text-slate-300">Parol</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock size={18} className="text-zinc-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-slate-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-600/20 mt-4 text-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Ulanmoqda...
                </span>
              ) : (
                <>Tizimga kirish <ArrowRight size={18} /></>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-zinc-400 mt-6">
          Tayyorlov Markaz © {new Date().getFullYear()} · Barcha huquqlar himoyalangan
        </p>
      </div>
    </div>
  );
}
