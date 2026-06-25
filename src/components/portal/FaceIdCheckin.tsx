import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, Fingerprint, CheckCircle2, XCircle, MapPin,
  Clock, RefreshCw, Loader2, UserCheck, Navigation,
  Shield, Eye,
} from 'lucide-react';

// ─── face-api.js modellar ─────────────────────────────────────────────────
//  Yengil (blink uchun): tinyFaceDetector + faceLandmark68TinyNet (280KB)
//  Tanish (identifikatsiya uchun): faceRecognitionNet (6.2MB) — WebGL (GPU) da

let faceapi: any = null;
let modelsReady = false;      // yengil modellar (blink)
let recognitionReady = false; // faceRecognitionNet (descriptor)
let webglActive = false;
let recognitionPromise: Promise<boolean> | null = null; // takror yuklamaslik uchun
let lastModelError = '';      // haqiqiy xato (diagnostika)

async function getFaceApi() {
  if (faceapi) return faceapi;
  const mod = await import('face-api.js');
  faceapi = mod;
  return faceapi;
}

// O'z serverimizdan — CDN muammosi yo'q
const MODEL_URL = '/models';

// Yengil modellarni yuklash (blink uchun) — har doim natija qaytaradi.
async function loadModels(timeoutMs = 12000): Promise<boolean> {
  if (modelsReady) return true;
  try {
    const work = (async () => {
      const api = await getFaceApi();
      try {
        await api.tf.setBackend('webgl');
        await api.tf.ready();
        webglActive = api.tf.getBackend() === 'webgl';
      } catch { webglActive = false; }
      await Promise.all([
        api.nets.tinyFaceDetector.loadFromUri(MODEL_URL),      // 190KB — yuz topish
        api.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL), // 75KB  — ko'z nuqtalari
      ]);
      modelsReady = true;
      return true;
    })();
    const timeout = new Promise<boolean>(resolve => setTimeout(() => resolve(false), timeoutMs));
    const ok = await Promise.race([work, timeout]);
    return ok;
  } catch {
    return false;
  }
}

// faceRecognitionNet — descriptor uchun. Bitta marta yuklaydi (takror chaqirsa kutadi).
function startRecognitionLoad(): Promise<boolean> {
  if (recognitionReady) return Promise.resolve(true);
  if (recognitionPromise) return recognitionPromise;
  recognitionPromise = (async () => {
    try {
      const api = await getFaceApi();
      await api.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      recognitionReady = true;
      return true;
    } catch (e: any) {
      lastModelError = (e?.message || String(e)).slice(0, 80);
      recognitionPromise = null; // qayta urinishga ruxsat
      return false;
    }
  })();
  return recognitionPromise;
}

// timeout bilan: model yuklanguncha (yoki vaqt tugaguncha) kutadi
async function loadRecognitionNet(timeoutMs = 60000): Promise<boolean> {
  if (recognitionReady) return true;
  const work = startRecognitionLoad();
  let timer: any;
  const timeout = new Promise<boolean>(resolve => { timer = setTimeout(() => { lastModelError = lastModelError || 'timeout'; resolve(false); }, timeoutMs); });
  const r = await Promise.race([work, timeout]);
  clearTimeout(timer);
  return r;
}

// Suratdan 128-o'lchamli yuz descriptorini chiqaradi.
// Xato bo'lsa ANIQ sabab bilan throw qiladi (diagnostika uchun).
async function extractDescriptor(canvas: HTMLCanvasElement, timeoutMs = 60000): Promise<number[]> {
  const api = await getFaceApi();

  // 1. Yengil modellar (detector + landmarks) — yuz topish uchun
  if (!modelsReady) {
    const ok = await loadModels(timeoutMs);
    if (!ok || !modelsReady) throw new Error('MODEL: detektor yuklanmadi');
  }
  // 2. Tanish modeli (descriptor) — 6.2MB
  if (!recognitionReady) {
    const ok = await loadRecognitionNet(timeoutMs);
    if (!ok) throw new Error('MODEL: tanish yuklanmadi — ' + (lastModelError || 'noma\'lum'));
  }

  // 3. Yuz topish + landmark + descriptor — bir nechta o'lcham bilan urinish
  let descriptor: number[] | null = null;
  let sawFace = false;

  const work = (async () => {
    for (const inputSize of [416, 320, 224, 512]) {
      const det = await api
        .detectSingleFace(canvas, new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.2 }))
        .withFaceLandmarks(true)        // tiny landmarks
        .withFaceDescriptor();          // faceRecognitionNet
      if (det && det.descriptor) {
        descriptor = Array.from(det.descriptor as Float32Array) as number[];
        return;
      }
      // descriptorsiz ham yuz topilganini bilish uchun
      const faceOnly = await api.detectSingleFace(canvas, new api.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.2 }));
      if (faceOnly) sawFace = true;
    }
  })();
  const timeout = new Promise<void>((_, rej) =>
    setTimeout(() => rej(new Error(`TIMEOUT: tahlil cho'zildi (WebGL: ${webglActive ? 'ha' : 'yoq'})`)), timeoutMs)
  );
  await Promise.race([work, timeout]);

  if (descriptor && (descriptor as number[]).length === 128) return descriptor;
  if (sawFace) throw new Error('NODESC: yuz topildi, lekin descriptor chiqmadi');
  throw new Error('NOFACE: yuz topilmadi (yorug\'lik/burchak)');
}

// ─── Ko'z aspekt nisbati (Eye Aspect Ratio) — ko'z yumish aniqlash ──────────

function eyeAspectRatio(pts: { x: number; y: number }[]): number {
  if (pts.length < 6) return 1;
  const v1 = Math.hypot(pts[1].x - pts[5].x, pts[1].y - pts[5].y);
  const v2 = Math.hypot(pts[2].x - pts[4].x, pts[2].y - pts[4].y);
  const h  = Math.hypot(pts[0].x - pts[3].x, pts[0].y - pts[3].y);
  return h > 0 ? (v1 + v2) / (2 * h) : 1;
}

const EAR_BLINK_THRESHOLD = 0.22; // Ko'z yumilgan holat
const EAR_OPEN_THRESHOLD  = 0.28; // Ko'z ochilgan holat

// ─── Types ──────────────────────────────────────────────────────────────────

interface Props { initData: string; staffName: string; }

interface AttendanceState {
  today: { id?: string; checkIn?: string; checkOut?: string; status?: string; location?: { name: string } } | null;
  faceRegistered: boolean;
  faceProfile?: { photoUrl?: string; registeredAt?: string } | null;
}

type Step =
  | 'loading_models' | 'loading_profile' | 'no_profile'
  | 'register_start' | 'capturing' | 'processing' | 'registered'
  | 'today_done' | 'ready_checkin' | 'ready_checkout'
  | 'checkin_capture' | 'checkout_capture'
  | 'verifying' | 'success_in' | 'success_out' | 'error';

async function portalFetch(endpoint: string, initData: string, opts?: RequestInit) {
  const params = new URLSearchParams(window.location.search);
  const urlToken = params.get('t') || localStorage.getItem('staff_url_token') || '';
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts?.headers as Record<string, string> || {}),
  };
  if (urlToken) headers['x-portal-token'] = urlToken;
  else if (initData) headers['x-telegram-init-data'] = initData;

  const res = await fetch(`/api/staff-portal${endpoint}`, { ...opts, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function getLocation() {
  return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS qo\'llab-quvvatlanmaydi'));
    navigator.geolocation.getCurrentPosition(
      p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      e => reject(new Error(e.message)),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

// ─── Camera + Blink Detection ────────────────────────────────────────────────

type BlinkState = 'waiting_face' | 'show_instruction' | 'blinked' | 'fallback';

function CameraView({
  onCapture, onCancel, instruction, blinkEnabled = true,
}: {
  onCapture: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
  instruction: string;
  blinkEnabled?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blinkStateRef = useRef<BlinkState>('waiting_face');
  const eyeWasClosedRef = useRef(false);
  const capturedRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [faceFound, setFaceFound] = useState(false);
  const [blinkState, setBlinkState] = useState<BlinkState>('waiting_face');
  const [fallbackSecs, setFallbackSecs] = useState(0);
  const [progress, setProgress] = useState(0); // 0-100 blink aniqlash

  const doCapture = useCallback(() => {
    if (capturedRef.current || !videoRef.current) return;
    capturedRef.current = true;
    if (detectRef.current) clearInterval(detectRef.current);
    const canvas = document.createElement('canvas');
    canvas.width  = videoRef.current.videoWidth  || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d')!.drawImage(videoRef.current, 0, 0);
    streamRef.current?.getTracks().forEach(t => t.stop());
    onCapture(canvas);
  }, [onCapture]);

  // Kamera
  useEffect(() => {
    let active = true;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    }).then(stream => {
      if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => { videoRef.current!.play(); setReady(true); };
      }
    }).catch(err => console.error('[CAM]', err));

    return () => {
      active = false;
      if (detectRef.current) clearInterval(detectRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Yuz + ko'z yumish aniqlash (faqat modellar yuklangan bo'lsa)
  useEffect(() => {
    if (!ready) return;
    // Model yuklanmagan — blink detection o'tkazib yuboriladi, oddiy suratga olish
    if (!blinkEnabled) {
      blinkStateRef.current = 'fallback';
      setBlinkState('fallback');
      return;
    }
    let fallbackTimer: ReturnType<typeof setInterval>;
    let secs = 0;

    // MASTER fallback: kamera tayyor bo'lgach 8s ichida blink bo'lmasa
    // (model hali yuklanmagan yoki yuz topilmagan) — qo'lda tugma chiqadi.
    const masterFallback = setTimeout(() => {
      if (!capturedRef.current && blinkStateRef.current !== 'blinked') {
        clearInterval(fallbackTimer);
        blinkStateRef.current = 'fallback';
        setBlinkState('fallback');
      }
    }, 8000);

    detectRef.current = setInterval(async () => {
      if (capturedRef.current || !videoRef.current) return;
      try {
        const api = await getFaceApi();
        const detection = await api.detectSingleFace(
          videoRef.current,
          new api.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.25 })
        ).withFaceLandmarks(true);

        if (!detection) {
          setFaceFound(false);
          blinkStateRef.current = 'waiting_face';
          setBlinkState('waiting_face');
          return;
        }

        setFaceFound(true);

        if (blinkStateRef.current === 'waiting_face') {
          blinkStateRef.current = 'show_instruction';
          setBlinkState('show_instruction');
          // 7 soniyadan keyin fallback
          secs = 0;
          fallbackTimer = setInterval(() => {
            secs++;
            setFallbackSecs(secs);
            if (secs >= 7) {
              clearInterval(fallbackTimer);
              if (!capturedRef.current) {
                blinkStateRef.current = 'fallback';
                setBlinkState('fallback');
              }
            }
          }, 1000);
        }

        if (blinkStateRef.current === 'show_instruction') {
          const lm = detection.landmarks;
          const leftEAR  = eyeAspectRatio(lm.getLeftEye());
          const rightEAR = eyeAspectRatio(lm.getRightEye());
          const avgEAR   = (leftEAR + rightEAR) / 2;

          // Ko'z yumildi → ochildi = blink
          if (avgEAR < EAR_BLINK_THRESHOLD) {
            eyeWasClosedRef.current = true;
            setProgress(100);
          } else if (eyeWasClosedRef.current && avgEAR > EAR_OPEN_THRESHOLD) {
            // Ko'z ochildi = blink tugadi → suratga olish
            eyeWasClosedRef.current = false;
            clearInterval(fallbackTimer);
            blinkStateRef.current = 'blinked';
            setBlinkState('blinked');
            setProgress(100);
            setTimeout(doCapture, 300); // kichik kechikish (ko'z ochilganidan so'ng)
          } else {
            const openRatio = Math.max(0, Math.min(100, ((EAR_OPEN_THRESHOLD - avgEAR) / (EAR_OPEN_THRESHOLD - EAR_BLINK_THRESHOLD)) * 100));
            setProgress(Math.max(0, Math.min(95, openRatio * 0.5)));
          }
        }
      } catch { /* ignore */ }
    }, 200);

    return () => {
      if (detectRef.current) clearInterval(detectRef.current);
      clearInterval(fallbackTimer);
      clearTimeout(masterFallback);
    };
  }, [ready, doCapture, blinkEnabled]);

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-sm text-zinc-500 text-center px-4">{instruction}</p>

      {/* Kamera */}
      <div className="relative w-64 h-64 rounded-2xl overflow-hidden bg-black">
        <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />

        {/* Oval doira */}
        <div className={`absolute inset-3 rounded-full border-4 transition-colors duration-200 ${
          blinkState === 'blinked'           ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.5)]' :
          blinkState === 'show_instruction'  ? 'border-blue-400 shadow-[0_0_16px_rgba(96,165,250,0.3)]' :
          faceFound                          ? 'border-white/60' : 'border-white/20'
        }`} />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <Loader2 className="animate-spin text-white" size={24} />
          </div>
        )}

        {/* Ko'rsatma etiketi */}
        <div className={`absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
          blinkState === 'blinked'           ? 'bg-emerald-500 text-white' :
          blinkState === 'show_instruction'  ? 'bg-blue-600 text-white animate-pulse' :
          faceFound                          ? 'bg-black/60 text-white/90' : 'bg-black/50 text-white/60'
        }`}>
          {blinkState === 'blinked'          ? '✓ Tasdiqlandi!' :
           blinkState === 'fallback'         ? 'Tayyor — bosing' :
           blinkState === 'show_instruction' ? '👁  Ko\'zingizni yumib oching' :
           faceFound                         ? 'Yuz aniqlandi — ko\'z yumilishini kuting' :
           'Yuzingizni yo\'naltiring'}
        </div>
      </div>

      {/* Progress bar (ko'z yumish aniqlash uchun) */}
      {blinkState === 'show_instruction' && (
        <div className="w-64 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-blue-500 rounded-full"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      )}

      {/* Fallback sanagich */}
      {blinkState === 'show_instruction' && fallbackSecs > 0 && fallbackSecs < 7 && (
        <p className="text-xs text-zinc-400 -mt-2">
          Ko'z yuming yoki {7 - fallbackSecs} soniyada tugma paydo bo'ladi
        </p>
      )}

      {/* Tugmalar */}
      <div className="flex gap-3 w-full px-4">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600 dark:text-zinc-300"
        >
          Bekor
        </button>
        <button
          onClick={doCapture}
          disabled={!ready || blinkState === 'blinked'}
          className={`flex-1 py-3 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40 ${
            blinkState === 'blinked'   ? 'bg-emerald-600' :
            blinkState === 'fallback'  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95' :
            blinkState === 'show_instruction' ? 'bg-blue-600/60 cursor-wait' :
            'bg-blue-600 hover:bg-blue-700 active:scale-95'
          }`}
        >
          {blinkState === 'blinked' ? (
            <><CheckCircle2 size={16} /> Tasdiqlandi</>
          ) : blinkState === 'fallback' ? (
            <><Camera size={16} /> Suratga olish</>
          ) : blinkState === 'show_instruction' ? (
            <><Eye size={16} /> Ko'z yuming...</>
          ) : (
            <><Camera size={16} /> Davom etish</>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function FaceIdCheckin({ initData, staffName }: Props) {
  const [step, setStep] = useState<Step>('loading_profile');
  const [attendanceState, setAttendanceState] = useState<AttendanceState | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successData, setSuccessData] = useState<any>(null);
  const [blinkEnabled, setBlinkEnabled] = useState(true); // model yuklanmasa false

  // Modellarni FONDA yuklash — UI ni bloklamaydi. Foydalanuvchi darhol
  // davomat ekranini ko'radi; model kamera ochilganda kerak bo'ladi.
  // Yuklansa: blink (tiriklik) tekshiruvi. Yuklanmasa: oddiy suratga olish.
  useEffect(() => {
    loadModels(12000).then(setBlinkEnabled);
    // 6.2MB tanish modelini DARHOL fonda yuklab boshlaymiz (kamera ochilguncha tayyor bo'lsin)
    startRecognitionLoad();
  }, []);

  // 2. Profil yuklanishi
  const loadProfile = useCallback(async () => {
    setStep('loading_profile');
    try {
      const data = await portalFetch('/my-attendance', initData);
      setAttendanceState(data);
      if (!data.faceRegistered)           setStep('no_profile');
      else if (data.today?.checkIn && data.today?.checkOut) setStep('today_done');
      else if (data.today?.checkIn)       setStep('ready_checkout');
      else                                setStep('ready_checkin');
    } catch { setStep('no_profile'); }
  }, [initData]);

  useEffect(() => { if (step === 'loading_profile') loadProfile(); }, [step, loadProfile]);

  const faceErr = (e: any) => `Yuzni aniqlab bo'lmadi. Yorug'roq joyda qayta urining.\n[${e?.message || 'xato'}]`;

  // 3. Ro'yxatga olish — haqiqiy descriptor saqlanadi (keyin solishtirish uchun)
  const handleRegisterCapture = async (canvas: HTMLCanvasElement) => {
    setStep('processing');
    let descriptor: number[];
    try {
      descriptor = await extractDescriptor(canvas);
    } catch (e: any) {
      setErrorMsg(faceErr(e));
      setStep('error');
      return;
    }
    try {
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
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

  // 4. Check-in — yuz solishtiriladi (mos kelmasa server rad etadi)
  const handleCheckInCapture = async (canvas: HTMLCanvasElement) => {
    setStep('verifying');
    let descriptor: number[];
    try {
      descriptor = await extractDescriptor(canvas);
    } catch (e: any) {
      setErrorMsg(faceErr(e));
      setStep('error');
      return;
    }
    try {
      const { latitude, longitude } = await getLocation().catch(() => {
        throw new Error('GPS joylashuvini aniqlash muvaffaqiyatsiz. Joylashuv ruxsatini bering.');
      });
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const data = await portalFetch('/check-in', initData, {
        method: 'POST',
        body: JSON.stringify({ descriptor, latitude, longitude, faceBypass: false, photoDataUrl }),
      });
      setSuccessData(data);
      setStep('success_in');
    } catch (err: any) {
      setErrorMsg(err.message || 'Kirib kelishda xatolik');
      setStep('error');
    }
  };

  // 5. Check-out — yuz solishtiriladi
  const handleCheckOutCapture = async (canvas: HTMLCanvasElement) => {
    setStep('verifying');
    let descriptor: number[];
    try {
      descriptor = await extractDescriptor(canvas);
    } catch (e: any) {
      setErrorMsg(faceErr(e));
      setStep('error');
      return;
    }
    try {
      const { latitude, longitude } = await getLocation().catch(() => ({ latitude: 0, longitude: 0 }));
      const data = await portalFetch('/check-out', initData, {
        method: 'POST',
        body: JSON.stringify({ descriptor, latitude, longitude, faceBypass: false }),
      });
      setSuccessData(data);
      setStep('success_out');
    } catch (err: any) {
      setErrorMsg(err.message || 'Chiqib ketishda xatolik');
      setStep('error');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-4 min-h-[60vh] flex flex-col">
      <AnimatePresence mode="wait">

        {step === 'loading_models' && (
          <motion.div key="lm" {...fade} className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
              <Fingerprint size={32} className="text-violet-600 animate-pulse" />
            </div>
            <div className="font-bold text-slate-800 dark:text-white">Face ID yuklanmoqda</div>
            <Loader2 className="animate-spin text-violet-600" size={22} />
          </motion.div>
        )}

        {step === 'loading_profile' && (
          <motion.div key="lp" {...fade} className="flex-1 flex items-center justify-center">
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </motion.div>
        )}

        {step === 'no_profile' && (
          <motion.div key="np" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
              <Fingerprint size={40} className="text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Yuz ID ro'yxatdan o'tilmagan</h3>
              <p className="text-sm text-zinc-400 mt-2 max-w-xs">
                Davomat uchun bir marta yuzingizni ro'yxatdan o'tkazing.
              </p>
            </div>
            <button
              onClick={() => setStep('register_start')}
              className="px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-sm flex items-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <Camera size={16} /> Yuzimni ro'yxatdan o'tkazish
            </button>
          </motion.div>
        )}

        {step === 'register_start' && (
          <motion.div key="rs" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Eye size={40} className="text-blue-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Yuz ID Ro'yxati</h3>
              <p className="text-sm text-zinc-400 mt-1">Kamera ochiladi</p>
            </div>
            <div className="w-full max-w-xs text-left space-y-2">
              {[
                ['Yaxshi yoritilgan joyda turing', '💡'],
                ['Kamera sizga qaratilganida ko\'z yuming', '👁'],
                ['Ko\'z yumilishi avtomatik aniqlanadi', '✅'],
              ].map(([t, e], i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-zinc-500">
                  <span>{e}</span> {t}
                </div>
              ))}
            </div>
            <div className="flex gap-3 w-full">
              <button onClick={() => setStep('no_profile')} className="flex-1 py-3 rounded-2xl border border-zinc-200 dark:border-zinc-700 text-sm font-semibold text-zinc-600">Bekor</button>
              <button onClick={() => setStep('capturing')} className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-bold">Boshlash →</button>
            </div>
          </motion.div>
        )}

        {step === 'capturing' && (
          <motion.div key="cap" {...fade} className="flex-1 flex flex-col justify-center">
            <CameraView
              blinkEnabled={blinkEnabled}
              instruction={blinkEnabled
                ? "Yuzingizni aylana ichiga joylashtiring va ko'zingizni bir marta yuming"
                : "Yuzingizni aylana ichiga joylashtiring va suratga oling"}
              onCapture={handleRegisterCapture}
              onCancel={() => setStep('no_profile')}
            />
          </motion.div>
        )}

        {step === 'checkin_capture' && (
          <motion.div key="cin" {...fade} className="flex-1 flex flex-col justify-center">
            <CameraView
              blinkEnabled={blinkEnabled}
              instruction={blinkEnabled
                ? "Kirib kelish uchun ko'zingizni bir marta yuming"
                : "Kirib kelish uchun suratga oling"}
              onCapture={handleCheckInCapture}
              onCancel={() => setStep('ready_checkin')}
            />
          </motion.div>
        )}

        {step === 'checkout_capture' && (
          <motion.div key="cout" {...fade} className="flex-1 flex flex-col justify-center">
            <CameraView
              blinkEnabled={blinkEnabled}
              instruction={blinkEnabled
                ? "Chiqib ketish uchun ko'zingizni bir marta yuming"
                : "Chiqib ketish uchun suratga oling"}
              onCapture={handleCheckOutCapture}
              onCancel={() => setStep('ready_checkout')}
            />
          </motion.div>
        )}

        {(step === 'processing' || step === 'verifying') && (
          <motion.div key="proc" {...fade} className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
              <Fingerprint size={32} className="text-blue-600 animate-pulse" />
            </div>
            <div className="font-bold text-slate-800 dark:text-white">
              {step === 'verifying' ? 'Yuz tekshirilmoqda...' : 'Yuz tahlil qilinmoqda...'}
            </div>
            <div className="flex gap-2">
              {[0, 150, 300].map(d => (
                <div key={d} className="w-2 h-2 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </motion.div>
        )}

        {step === 'registered' && (
          <motion.div key="reg" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}
              className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={40} className="text-emerald-600" />
            </motion.div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Ro'yxatdan o'tildi!</h3>
              <p className="text-sm text-zinc-400 mt-1">Yuz ID muvaffaqiyatli saqlandi</p>
            </div>
            <button onClick={loadProfile} className="px-8 py-3.5 bg-emerald-600 text-white rounded-2xl font-bold text-sm">
              Davom etish →
            </button>
          </motion.div>
        )}

        {step === 'ready_checkin' && (
          <motion.div key="rci" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5">
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
                  <Clock size={18} className="text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-sm text-blue-900 dark:text-blue-300">Bugun hali kelmadingiz</div>
                  <div className="text-xs text-blue-600/70">Ko'z yumib kelishingizni tasdiqlang</div>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-400 justify-center">
                <Navigation size={11} /> GPS avtomatik aniqlanadi
                <Shield size={11} className="ml-2" /> Ko'z yumish = tiriklik tekshiruvi
              </div>
            </div>
            <button onClick={() => setStep('checkin_capture')}
              className="w-full py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base flex items-center justify-center gap-3 shadow-xl shadow-blue-500/25 active:scale-95 transition-all">
              <Fingerprint size={22} /> Ishga keldim!
            </button>
          </motion.div>
        )}

        {step === 'ready_checkout' && (
          <motion.div key="rco" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5">
            {attendanceState?.faceProfile?.photoUrl && (
              <div className="w-20 h-20 rounded-full overflow-hidden ring-4 ring-emerald-200 dark:ring-emerald-800">
                <img src={attendanceState.faceProfile.photoUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="text-center">
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">{staffName}</h3>
            </div>
            <div className="w-full px-2">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 size={20} className="text-emerald-600 flex-shrink-0" />
                <div>
                  <div className="font-semibold text-sm text-emerald-900 dark:text-emerald-300">
                    Kirib kelgan: {attendanceState?.today?.checkIn}
                  </div>
                  <div className="text-xs text-emerald-600/70">
                    {attendanceState?.today?.status === 'late' ? 'Kechikib kelgansiz' : 'O\'z vaqtida keldingiz'}
                    {attendanceState?.today?.location && ` · ${attendanceState.today.location.name}`}
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setStep('checkout_capture')}
              className="w-full py-4 rounded-2xl bg-slate-800 hover:bg-slate-900 dark:bg-zinc-700 text-white font-bold text-base flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
              <Fingerprint size={22} /> Ishdan ketdim
            </button>
          </motion.div>
        )}

        {step === 'today_done' && (
          <motion.div key="td" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <UserCheck size={40} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Bugungi davomat belgilandi</h3>
              <div className="mt-3 space-y-1 text-sm">
                <div className="text-zinc-500">Kirish: <span className="font-bold text-emerald-600">{attendanceState?.today?.checkIn}</span></div>
                <div className="text-zinc-500">Chiqish: <span className="font-bold text-slate-700 dark:text-zinc-200">{attendanceState?.today?.checkOut}</span></div>
                {attendanceState?.today?.location && (
                  <div className="flex items-center justify-center gap-1 text-xs text-zinc-400">
                    <MapPin size={11} /> {attendanceState.today.location.name}
                  </div>
                )}
              </div>
            </div>
            <button onClick={loadProfile} className="flex items-center gap-2 text-sm text-blue-600 font-semibold">
              <RefreshCw size={14} /> Yangilash
            </button>
          </motion.div>
        )}

        {step === 'success_in' && (
          <motion.div key="si" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}
              className="w-24 h-24 rounded-3xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={48} className="text-emerald-600" />
            </motion.div>
            <div>
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">Xush kelibsiz!</h3>
              <div className="mt-3 space-y-2">
                <div className="text-3xl font-black text-slate-800 dark:text-white">{successData?.checkIn}</div>
                <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${
                  successData?.status === 'late' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {successData?.status === 'late' ? <Clock size={14} /> : <CheckCircle2 size={14} />}
                  {successData?.status === 'late' ? 'Kechikib keldingiz' : 'O\'z vaqtida keldingiz'}
                </div>
                {successData?.location && (
                  <div className="flex items-center justify-center gap-1 text-sm text-zinc-400">
                    <MapPin size={13} /> {successData.location}
                  </div>
                )}
                <div className="text-xs text-violet-500">📍 GPS + tiriklik tekshiruvi</div>
              </div>
            </div>
            <button onClick={loadProfile} className="px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold text-sm">Tamom</button>
          </motion.div>
        )}

        {step === 'success_out' && (
          <motion.div key="so" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}
              className="w-24 h-24 rounded-3xl bg-slate-100 dark:bg-zinc-700 flex items-center justify-center">
              <CheckCircle2 size={48} className="text-slate-600 dark:text-zinc-300" />
            </motion.div>
            <div>
              <h3 className="font-bold text-xl text-slate-800 dark:text-white">Xayr ko'ring!</h3>
              <div className="text-3xl font-black text-slate-800 dark:text-white mt-2">{successData?.checkOut}</div>
              <p className="text-sm text-zinc-400 mt-1">Chiqish vaqti belgilandi</p>
            </div>
            <button onClick={loadProfile} className="px-6 py-3 bg-slate-700 text-white rounded-2xl font-bold text-sm">Tamom</button>
          </motion.div>
        )}

        {step === 'error' && (
          <motion.div key="err" {...fade} className="flex-1 flex flex-col items-center justify-center gap-5 text-center">
            <div className="w-20 h-20 rounded-3xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
              <XCircle size={40} className="text-red-600" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-800 dark:text-white">Xatolik</h3>
              <p className="text-sm text-zinc-400 mt-2 max-w-xs whitespace-pre-line">{errorMsg}</p>
            </div>
            <button onClick={loadProfile} className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold text-sm flex items-center gap-2">
              <RefreshCw size={14} /> Qayta urinish
            </button>
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
