import { jsPDF } from 'jspdf';

let cachedFontBase64: string | null = null;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export async function loadRobotoFont(): Promise<string> {
  if (cachedFontBase64) return cachedFontBase64;
  try {
    const response = await fetch('/fonts/Roboto-Regular.ttf');
    if (!response.ok) throw new Error('Font file could not be loaded');
    const arrayBuffer = await response.arrayBuffer();
    cachedFontBase64 = arrayBufferToBase64(arrayBuffer);
    return cachedFontBase64;
  } catch (error) {
    console.error('Error loading Roboto font:', error);
    throw error;
  }
}

export async function applyUnicodeFont(doc: jsPDF): Promise<void> {
  try {
    const fontBase64 = await loadRobotoFont();
    doc.addFileToVFS('Roboto-Regular.ttf', fontBase64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    // Faqat bitta shrift fayli bor (Regular) — lekin jsPDF/autoTable "bold" uslub
    // so'ralganda, agar shu nom uchun 'bold' variant ro'yxatdan o'tmagan bo'lsa,
    // standart (Unicode'siz) Helvetica-Bold'ga qaytadi — natijada jadval sarlavhalarida
    // o'zbek harflari (o', g') buziladi. Shuning uchun 'bold'/'italic' so'rovlari ham
    // xuddi shu Unicode faylga yo'naltiriladi (vizual qalinlashmaydi, lekin matn buzilmaydi).
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bold');
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'italic');
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'bolditalic');
    doc.setFont('Roboto');
  } catch (error) {
    console.warn('Could not apply Unicode font, falling back to default:', error);
  }
}
