// Marketing atributsiyasi (UTM/gclid/fbclid) — birinchi kirishda URL'dan o'qib
// sessionStorage'ga saqlaydi. Kerak, chunki React Router'dagi client-side
// navigatsiya (masalan bosh sahifadan "Aloqa" sahifasiga o'tish) query
// parametrlarni saqlab qolmaydi — reklama havolasi orqali kirgan tashrifchi
// boshqa sahifada forma to'ldirsa ham, qaysi kampaniyadan kelgani yo'qolmasligi
// kerak (Marketing > ROI'dagi manba/kampaniya tahlili shunga tayanadi).
const STORAGE_KEY = 'tm_attribution';

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  gclid?: string;
  fbclid?: string;
  landingPage?: string;
  referrer?: string;
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid'] as const;

/** Sahifa yuklanganda bir marta chaqiriladi (App.tsx) — URL'da UTM bo'lsa saqlaydi. */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try {
    const params = new URLSearchParams(window.location.search);
    const found: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const v = params.get(key);
      if (v) found[key] = v;
    }
    // URL'da UTM yo'q bo'lsa — sessiyada avval saqlangan atributsiyani buzmaymiz
    // (masalan reklamadan kirib, keyin ichki havola orqali boshqa sahifaga o'tgan bo'lishi mumkin).
    if (Object.keys(found).length === 0) return;

    const attribution: Attribution = {
      ...found,
      landingPage: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // xotira to'lgan yoki maxfiy rejim — jim o'tkaziladi, atributsiyasiz ham forma ishlashi kerak
  }
}

/** Lid formalarida (LeadForm.tsx, Contact.tsx) yuborishda qo'shiladi. */
export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
