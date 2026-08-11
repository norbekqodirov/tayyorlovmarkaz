// JWT imzolash/tekshirish uchun yagona manba. Avval har bir fayl o'zining
// mahalliy fallback qiymatiga ega edi (ba'zilari 'fallback-secret-key-for-local',
// ba'zilari 'dev-only-secret-key') — bu ikki muammo edi: (1) JWT_SECRET
// o'rnatilmagan muhitda server "ma'lum" qiymat bilan tokenlarni imzolashni
// davom ettirardi (soxta SUPER_ADMIN token yasash mumkin edi), (2) fallback
// qiymatlar bir-biriga mos kelmagani uchun turli modullarda imzolangan/
// tekshirilgan tokenlar bir-birini tan olmasligi ham mumkin edi.
const secret = process.env.JWT_SECRET;
if (!secret) {
    throw new Error(
        "JWT_SECRET muhit o'zgaruvchisi o'rnatilmagan! .env faylini tekshiring — " +
        'xavfsizlik uchun server aniq qiymatsiz ishga tushmaydi.'
    );
}

export const JWT_SECRET = secret;
