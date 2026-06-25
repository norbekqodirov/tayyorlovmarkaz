/**
 * Face ID Davomat komponenti — Staff Bot Mini App da ishlatiladi.
 *
 * Oqim:
 * 1. face-api.js modellarini CDN dan yuklash
 * 2. Yuz profilini tekshirish — ro'yxatdan o'tganmi?
 * 3. Ro'yxatdan o'tmagan bo'lsa → Yuz ro'yxatga olish rejimi
 * 4. Ro'yxatdan o'tgan bo'lsa → Kirib kelish / Chiqib ketish
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Fingerprint, CheckCircle2, XCircle, MapPin,
  Clock, RefreshCw, AlertCircle, ChevronRight, Loader2,
  UserCheck, Navigation, Shield,
} from 'lucide-react';

// ─── face-api.js lazy import ─────────────────────────────────────────────────

let faceapi: any = null;

async function loadFaceApi() {
  if (faceapi) return faceapi;
  const mod = await import('face-api.js');
  faceapi = mod;
  return faceapi;
}

// CDN dan model yuklash (jsdelivr)
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights';

async function loadModels() {
  const api = await loadFaceApi();
  await Promise.all([
    api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
    api.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    api.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  initData: string;
  staffName: string;
}

interface AttendanceState {
  today: {
    id?: string;
    checkIn?: string;
    checkOut?: string;
    status?: string;
    location?: { name: string };
  } | null;
  faceRegistered: boolean;
  faceProfile?: { photoUrl?: string; registeredAt?: string } | null;
}

type Step =
  | 'loading_models'   // face-api yuklanyapti
  | 'loading_profile'  // profil yuklanmoqda
  | 'no_profile'       // hali ro'yxatdan o'tmagan
  | 'register_start'   // ro'yxatga olish boshlanmoqda
  | 'capturing'        // kamera ochiq
  | 'processing'       // descriptor chiqarilmoqda
  | 'registered'       // muvaffaqiyatli ro'yxatdan o'tdi
  | 'today_done'       // bugun allaqachon kirib kelgan
  | 'ready_checkin'    // kirib kelishga tayyor
  | 'ready_checkout'   // chiqib ketishga tayyor
  | 'checkin_capture'  // kamera: check-in uchun
  | 'checkout_capture' // kamera: check-out uchun
  | 'verifying'        // server bilan tekshirilmoqda
  | 'success_in'       // kirib keldi
  | 'success_out'      // chiqib ketdi
  | 'error';           // xatolik

const API_BASE = '/api/staff-portal';

async function portalFetch(endpoint: string, initData: string, opts?: RequestInit) {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('t') || localStorage.getItem('staff_url_token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> || {}),
  };
  if (urlToken) headers['x-portal-token'] = urlToken;
  else if (initData) headers['x-telegram-init-data'] = initData;

  const res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── GPS helper ──────────────────────────────────────────────────────────────

function getLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS qo\'llab-quvvatlanmaydi'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(new Error(err.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ─── Camera component ────────────────────────────────────────────────────────

function CameraView({
  onCapture, onCancel, instruction,
}: {
  onCapture: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
  instruction: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [detected, setDetected] = useState(false);
  const [manualAllowed, setManualAllowed] = useState(false);
  const detectTimer = useRef<any>(null);
  const manualTimer = useRef<any>(null);

  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640, height: 480 } })
      .then(stream => {
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setReady(true);
          };
        }
      })
      .catch(console.error);

    return () => {
      active = false;
      if (detectTimer.current) clearInterval(detectTimer.current);
      if (manualTimer.current) clearTimeout(manualTimer.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Real-time yuz aniqlash
  useEffect(() => {
    if (!ready || !videoRef.current) return;
    let running = true;

    const detect = async () => {
      if (!running || !videoRef.current) return;
      try {
        const api = await loadFaceApi();
        const result = await api.detectSingleFace(
          videoRef.current,
          new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
        );
        if (running) setDetected(!!result);
      } catch (e) {
        console.warn('[FaceID] Detection error:', e);
      }
    };

    detectTimer.current = setInterval(detect, 500);
    // 8 soniya o'tsa qo'lda olishga ruxsat
    manualTimer.current = setTimeout(() => { if (running) setManualAllowed(true); }, 8000);
    return () => { running = false; clearInterval(detectTimer.current); clearTimeout(manualTimer.current); };
  }, [ready]);

  const capture = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onCapture(canvas);
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-zinc-500 text-center px-4">{instruction}</p>

      <div className="relative w-64 h-64 rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />

        {/* Face detection overlay */}
        <div className={`absolute inset-4 rounded-full border-4 transition-colors duration-300 ${
          detected ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.4)]' : 'border-white/30'
        }`} />

        {/* Corner markers */}
        {['-top-0 -left-0', '-top-0 -right-0', '-bottom-0 -left-0', '-bottom-0 -right-0'].map((pos, i) => (
          <div key={i} className={`absolute ${pos} w-6 h-6 border-l-0 border-t-0`} />
        ))}

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <Loader2 className="animate-spin text-white" size={24} />
          </div>
        )}

        {/* Status */}
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold transition-all ${
          detected
            ? 'bg-emerald-500 text-white'
            : 'bg-black/50 text-white/70'
        }`}>
          {detected ? '✓ Yuz aniqlandi' : 'Yuzingizni yo\'naltiring'}
        </div>
      </div>

      <div className="flex gap-3 w-full px-4">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
        >
          Bekor
        </button>
        <button
          onClick={capture}
          disabled={!ready || (!detected && !manualAllowed)}
          className={`flex-1 py-3 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            detected ? 'bg-blue-600 hover:bg-blue-700' :
            manualAllowed ? 'bg-amber-500 hover:bg-amber-600' :
            'bg-blue-600 opacity-40 cursor-not-allowed'
          }`}
        >
          <Camera size={16} />
          {detected ? 'Suratga olish' : manualAllowed ? 'Qo\'lda olish' : 'Suratga olish'}
        </button>
      </div>
      {manualAllowed && !detected && (
        <p className="text-xs text-amber-600 text-center px-4 -mt-2">
          Yuz aniqlanmadi — yorug'likni yaxshilang yoki boshqa qurilmada urinib ko'ring
        </p>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function FaceIdCheckin({ initData, staffName }: Props) {
  const [step, setStep] = useState<Step>('loading_models');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [attendanceState, setAttendanceState] = useState<AttendanceState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<any>(null);
  const [capturedCanvas, setCapturedCanvas] = useState<HTMLCanvasElement | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // ─── 1. Modellarni yuklash ────────────────────────────────────────────────

  useEffect(() => {
    loadModels()
      .then(() => {
        setModelsLoaded(true);
        setStep('loading_profile');
      })
      .catch(err => {
        setErrorMsg('Yuz aniqlash modeli yuklanmadi. Internet aloqasini tekshiring.');
        setStep('error');
      });
  }, []);

  // ─── Elapsed timer (processing/verifying) ───────────────────────────────
  useEffect(() => {
    if (step !== 'processing' && step !== 'verifying') { setElapsed(0); return; }
    const t = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [step]);

  // ─── 2. Profil va bugungi holat ──────────────────────────────────────────

  const loadProfile = useCallback(async () => {
    setStep('loading_profile');
    try {
      const data = await portalFetch('/my-attendance', initData);
      setAttendanceState(data);

      if (!data.faceRegistered) {
        setStep('no_profile');
      } else if (data.today?.checkIn && data.today?.checkOut) {
        setStep('today_done');
      } else if (data.today?.checkIn) {
        setStep('ready_checkout');
      } else {
        setStep('ready_checkin');
      }
    } catch {
      setStep('no_profile');
    }
  }, [initData]);

  useEffect(() => {
    if (step === 'loading_profile') loadProfile();
  }, [step, loadProfile]);

  // ─── 3. Descriptor olish (12s timeout bilan) ─────────────────────────────

  const extractDescriptor = async (canvas: HTMLCanvasElement): Promise<number[] | null> => {
    const api = await loadFaceApi();

    let timer: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), 12000);
    });

    try {
      const detection = await Promise.race([
        api.detectSingleFace(
          canvas,
          new api.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.3 })
        ).withFaceLandmarks().withFaceDescriptor(),
        timeoutPromise,
      ]);
      clearTimeout(timer!);
      if (!detection) return null;
      return Array.from(detection.descriptor as Float32Array);
    } catch (e: any) {
      clearTimeout(timer!);
      if (e.message === 'TIMEOUT') throw e;
      console.warn('[FaceID] extractDescriptor:', e);
      return null;
    }
  };

  // ─── 4. Yuz ro'yxatga olish ──────────────────────────────────────────────

  const handleRegisterCapture = async (canvas: HTMLCanvasElement) => {
    setStep('processing');
    setCapturedCanvas(canvas);
    try {
      let descriptor: number[] | null = null;
      try {
        descriptor = await extractDescriptor(canvas);
      } catch (e: any) {
        if (e.message === 'TIMEOUT') {
          setErrorMsg('Qurilmangiz yuz tahlilini qo\'llab-quvvatlamaydi (12s). Yorug\'liqni yaxshilab yoki boshqa qurilmada urinib ko\'ring.');
          setStep('error');
          return;
        }
      }

      if (!descriptor) {
        setErrorMsg('Yuz aniqlanmadi. Yaxshi yoritilgan joyda, to\'g\'ri burchakda qayta urinib ko\'ring.');
        setStep('error');
        return;
      }

      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      await portalFetch('/face-profile', initData, {
        method: 'POST',
        body: JSON.stringify({ descriptor, photoDataUrl }),
      });

      setStep('registered');
    } catch (err: any) {
      setErrorMsg(err.message || 'Ro\'yxatdan o\'tishda xatolik');
      setStep('error');
    }
  };

  // ─── 5. Check-in ─────────────────────────────────────────────────────────

  const handleCheckInCapture = async (canvas: HTMLCanvasElement) => {
    setStep('verifying');
    try {
      let descriptor: number[] | null = null;
      let faceBypass = false;

      try {
        descriptor = await extractDescriptor(canvas);
      } catch (e: any) {
        if (e.message === 'TIMEOUT') faceBypass = true;
      }

      const { latitude, longitude } = await getLocation().catch(() => {
        throw new Error('GPS joylashuvini aniqlash muvaffaqiyatsiz. Joylashuv ruxsatini bering.');
      });

      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.6);

      const data = await portalFetch('/check-in', initData, {
        method: 'POST',
        body: JSON.stringify({
          descriptor: descriptor || [],
          latitude,
          longitude,
          faceBypass,
          photoDataUrl: faceBypass ? photoDataUrl : undefined,
        }),
      });

      setSuccessData({ ...data, faceBypass });
      setStep('success_in');
    } catch (err: any) {
      setErrorMsg(err.message || 'Kirib kelishda xatolik');
      setStep('error');
    }
  };

  // ─── 6. Check-out ────────────────────────────────────────────────────────

  const handleCheckOutCapture = async (canvas: HTMLCanvasElement) => {
    setStep('verifying');
    try {
      let descriptor: number[] | null = null;
      let faceBypass = false;

      try {
        descriptor = await extractDescriptor(canvas);
      } catch (e: any) {
        if (e.message === 'TIMEOUT') faceBypass = true;
      }

      const { latitude, longitude } = await getLocation().catch(() => ({ latitude: 0, longitude: 0 }));

      const data = await portalFetch('/check-out', initData, {
        method: 'POST',
        body: JSON.stringify({
          descriptor: descriptor || [],
          latitude,
          longitude,
          faceBypass,
        }),
      });

      setSuccessData(data);
      setStep('success_out');
    } catch (err: any) {
      setErrorMsg(err.message || 'Chiqib ketishda xatolik');
      setStep('error');
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-4 min-h-[60vh] flex flex-col">
      <AnimatePresence mode="wait">

        {/* Loading models */}
        {step === 'loading_models' && (
          <motion.div key="loading_models" {...fade} className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
              <Fingerprint size={32} className="text-violet-600 dark:text-violet-400 animate-pulse" />
            </div>
            <div>
              <div className="font-bold text-slate-800 dark:text-white">Face ID yuklanmoqda</div>
              <p className="text-sm text-zinc-400 mt-1">Yuz aniqlash modeli internet orqali yuklanmoqda...</p>
            </div>
            <Loader2 className="animate-spin text-violet-600" size={24} />
          </motion.div>
        )}

        {/* Loading profile */}
        {step === 'loading_profile' && (
          <motion.div key="loading_profile" {...fade} className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </motion.div>
        )}

        {/* No face profile */}
        {step === 'no_profile' && (
          <motion.div key="no_profile" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <Fingerprint size={40} className="text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Yuz ID ro'yxatdan o'tilmagan</h3>
              <p className="text-sm text-zinc-400 mt-2 max-w-xs">
                Davomat tizimidan foydalanish uchun avval yuzingizni bir marta ro'yxatdan o'tkazing.
                Bu faqat bir marta amalga oshiriladi.
              </p>
            </div>
            <button
              onClick={() => setStep('register_start')}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-blue-500/25 active:scale-95 transition-all"
            >
              <Camera size={16} /> Yuzimni ro'yxatdan o'tkazish
            </button>
            <p className="text-xs text-zinc-400 max-w-xs">
              Yuzingiz shifrlangan holda saqlanadi va faqat davomat uchun ishlatiladi.
            </p>
          </motion.div>
        )}

        {/* Register start */}
        {step === 'register_start' && (
          <motion.div key="register_start" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Camera size={40} className="text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Yuz ID Ro'yxati</h3>
              <p className="text-sm text-zinc-400 mt-2">Kamera ochiladi, yuzingizni markazga yo'naltiring</p>
            </div>
            <div className="text-left space-y-2 w-full max-w-xs">
              {['Yaxshi yoritilgan joyda turing', 'Yuzingiz to\'liq ko\'rinadigan bo\'lsin', 'Ko\'zoynakni olib qo\'yish tavsiya etiladi'].map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-zinc-500">
                  <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" /> {t}
                </div>
              ))}
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setStep('no_profile')} className="flex-1 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300">Bekor</button>
              <button
                onClick={() => setStep('capturing')}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold"
              >
                Boshlash →
              </button>
            </div>
          </motion.div>
        )}

        {/* Camera for registration */}
        {step === 'capturing' && (
          <motion.div key="capturing" {...fade} className="flex-1 flex flex-col justify-center">
            <CameraView
              instruction="Yuzingizni aylana ichiga joylashtiring va 'Suratga olish' tugmasini bosing"
              onCapture={handleRegisterCapture}
              onCancel={() => setStep('no_profile')}
            />
          </motion.div>
        )}

        {/* Camera for check-in */}
        {step === 'checkin_capture' && (
          <motion.div key="checkin_capture" {...fade} className="flex-1 flex flex-col justify-center">
            <CameraView
              instruction="Yuzingizni aylana ichiga joylashtiring — kirib kelish belgilanadi"
              onCapture={handleCheckInCapture}
              onCancel={() => setStep('ready_checkin')}
            />
          </motion.div>
        )}

        {/* Camera for check-out */}
        {step === 'checkout_capture' && (
          <motion.div key="checkout_capture" {...fade} className="flex-1 flex flex-col justify-center">
            <CameraView
              instruction="Yuzingizni aylana ichiga joylashtiring — chiqib ketish belgilanadi"
              onCapture={handleCheckOutCapture}
              onCancel={() => setStep('ready_checkout')}
            />
          </motion.div>
        )}

        {/* Processing */}
        {(step === 'processing' || step === 'verifying') && (
          <motion.div key="processing" {...fade} className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Fingerprint size={32} className="text-blue-600 dark:text-blue-400 animate-pulse" />
            </div>
            <div>
              <div className="font-bold text-slate-800 dark:text-white">
                {step === 'verifying' ? 'Tekshirilmoqda...' : 'Yuz tahlil qilinmoqda...'}
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                {step === 'verifying'
                  ? 'Yuz mos kelishini va joylashuvni tekshiryapmiz'
                  : `Yuz belgilari chiqarilmoqda... ${elapsed}s / 12s`}
              </p>
            </div>
            <div className="flex gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            {elapsed >= 8 && step === 'processing' && (
              <p className="text-xs text-amber-600 max-w-xs">
                Tahlil davom etmoqda — qurilmangizga bog'liq. Iltimos kuting...
              </p>
            )}
          </motion.div>
        )}

        {/* Registered */}
        {step === 'registered' && (
          <motion.div key="registered" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center"
            >
              <CheckCircle2 size={40} className="text-emerald-600 dark:text-emerald-400" />
            </motion.div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Ro'yxatdan o'tildi!</h3>
              <p className="text-sm text-zinc-400 mt-1">Yuz ID muvaffaqiyatli saqlandi</p>
            </div>
            <button
              onClick={() => loadProfile()}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              Davom etish <ChevronRight size={16} />
            </button>
          </motion.div>
        )}

        {/* Ready check-in */}
        {step === 'ready_checkin' && (
          <motion.div key="ready_checkin" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5">
            {/* Profile info */}
            {attendanceState?.faceProfile?.photoUrl && (
              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-blue-200 dark:ring-blue-800">
                <img src={attendanceState.faceProfile.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="text-center">
              <p className="text-zinc-400 text-sm">Salom,</p>
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">{staffName}</h3>
              <p className="text-zinc-400 text-sm mt-1">
                {new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>

            <div className="w-full space-y-3 px-2">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                  <Clock size={18} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-blue-900 dark:text-blue-300">Bugun hali kelmadingiz</div>
                  <div className="text-xs text-blue-600/70 dark:text-blue-400/70">Face ID bilan kirish tasdiqlang</div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-400 justify-center">
                <Navigation size={11} /> GPS avtomatik aniqlanadi
                <Shield size={11} className="ml-2" /> Face ID tekshiradi
              </div>
            </div>

            <button
              onClick={() => setStep('checkin_capture')}
              className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base flex items-center justify-center gap-3 shadow-xl shadow-blue-500/25 active:scale-95 transition-all"
            >
              <Fingerprint size={22} /> Ishga keldim!
            </button>
          </motion.div>
        )}

        {/* Ready check-out */}
        {step === 'ready_checkout' && (
          <motion.div key="ready_checkout" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5">
            {attendanceState?.faceProfile?.photoUrl && (
              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-emerald-200 dark:ring-emerald-800">
                <img src={attendanceState.faceProfile.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="text-center">
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">{staffName}</h3>
            </div>

            <div className="w-full space-y-3 px-2">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-sm text-emerald-900 dark:text-emerald-300">
                    Kirib kelgan: {attendanceState?.today?.checkIn}
                  </div>
                  <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                    {attendanceState?.today?.status === 'late' ? 'Kechikib kelgansiz' : 'O\'z vaqtida keldingiz'}
                    {attendanceState?.today?.location && ` · ${attendanceState.today.location.name}`}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('checkout_capture')}
              className="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white font-bold text-base flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all"
            >
              <Fingerprint size={22} /> Ishdan ketdim
            </button>
          </motion.div>
        )}

        {/* Today done */}
        {step === 'today_done' && (
          <motion.div key="today_done" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <UserCheck size={40} className="text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Bugungi davomat belgilandi</h3>
              <div className="mt-3 space-y-1 text-sm">
                <div className="text-zinc-500">
                  Kirish: <span className="font-bold text-emerald-600">{attendanceState?.today?.checkIn}</span>
                </div>
                <div className="text-zinc-500">
                  Chiqish: <span className="font-bold text-slate-700 dark:text-zinc-200">{attendanceState?.today?.checkOut}</span>
                </div>
                {attendanceState?.today?.location && (
                  <div className="flex items-center justify-center gap-1 text-xs text-zinc-400">
                    <MapPin size={11} /> {attendanceState.today.location.name}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => loadProfile()} className="flex items-center gap-2 text-sm text-blue-600 font-semibold">
              <RefreshCw size={14} /> Yangilash
            </button>
          </motion.div>
        )}

        {/* Success check-in */}
        {step === 'success_in' && (
          <motion.div key="success_in" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="w-24 h-24 rounded-3xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center"
            >
              <CheckCircle2 size={48} className="text-emerald-600 dark:text-emerald-400" />
            </motion.div>
            <div>
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">Xush kelibsiz!</h3>
              <div className="mt-3 space-y-2">
                <div className="text-3xl font-black text-slate-800 dark:text-white">{successData?.checkIn}</div>
                <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                  successData?.status === 'late'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                }`}>
                  {successData?.status === 'late' ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                  {successData?.status === 'late' ? 'Kechikib keldingiz' : 'O\'z vaqtida keldingiz'}
                </div>
                {successData?.location && (
                  <div className="flex items-center justify-center gap-1 text-sm text-zinc-400">
                    <MapPin size={13} /> {successData.location}
                  </div>
                )}
                <div className="text-xs text-violet-500">
                  {successData?.faceBypass
                    ? 'GPS orqali tasdiqlandi'
                    : `Face ID: ${Math.round((successData?.faceScore || 0) * 100)}% mos`}
                </div>
              </div>
            </div>
            <button onClick={() => loadProfile()} className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
              Tamom
            </button>
          </motion.div>
        )}

        {/* Success check-out */}
        {step === 'success_out' && (
          <motion.div key="success_out" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300 }}
              className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-zinc-700 flex items-center justify-center"
            >
              <CheckCircle2 size={48} className="text-slate-600 dark:text-zinc-300" />
            </motion.div>
            <div>
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">Xayr ko'ring!</h3>
              <div className="text-3xl font-black text-slate-800 dark:text-white mt-2">{successData?.checkOut}</div>
              <p className="text-sm text-zinc-400 mt-1">Chiqish vaqti belgilandi</p>
            </div>
            <button onClick={() => loadProfile()} className="px-6 py-3 bg-slate-700 dark:bg-zinc-600 text-white rounded-2xl font-bold text-sm">
              Tamom
            </button>
          </motion.div>
        )}

        {/* Error */}
        {step === 'error' && (
          <motion.div key="error" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
              <XCircle size={40} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Xatolik</h3>
              <p className="text-sm text-zinc-400 mt-2 max-w-xs">{errorMsg}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => loadProfile()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm flex items-center gap-2"
              >
                <RefreshCw size={14} /> Qayta urinish
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}

const fade = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.2 },
};
