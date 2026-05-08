# Tayyorlov Markaz CRM

> O'quv markaz uchun to'liq avtomatlashtirilgan boshqaruv tizimi (SaaS CRM).

## 🚀 Loyihani Ishga Tushurish (Local)

### 1. Muhitni sozlash

```bash
# Repozitoriyani yuklab oling
git clone https://github.com/norbekqodirov/tayyorlovmarkaz.git
cd tayyorlovmarkaz

# Muhit o'zgaruvchilarini sozlang
cp .env.example .env
# .env faylini tahrirlang va JWT_SECRET va boshqa qiymatlarni to'ldiring
```

### 2. O'rnatish va ulash

```bash
# Paketlarni o'rnatish
npm install

# Ma'lumotlar bazasini yaratish
npm run db:push

# Ishga tushurish (frontend + backend bir vaqtda)
npm run dev
```

Ilova `http://localhost:3000` da ochiladi.  
Admin kirish: `admin@tayyorlovmarkaz.uz` / `Admin2026!`

---

## 🖥️ Serverga Joylashtirish (Production)

### 1. Server talablari
- Node.js 18+
- npm
- PM2 (`npm install -g pm2`)

### 2. Loyihani serverga joylashtirish

```bash
git clone https://github.com/norbekqodirov/tayyorlovmarkaz.git
cd tayyorlovmarkaz
npm install

# .env faylini to'ldiring (muhim!)
cp .env.example .env
nano .env  # JWT_SECRET, DATABASE_URL, NODE_ENV=production ni to'ldiring

# Ma'lumotlar bazasini sozlash
npm run db:push
npm run db:generate

# Frontend ni build qilish
npm run build

# PM2 bilan ishga tushurish
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup  # server qayta ishga tushganda avtomatik start
```

### 3. Nginx konfiguratsiyasi

```nginx
server {
    listen 80;
    server_name yourdomain.uz;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 📁 Loyiha Tuzilmasi

```
tayyorlovmarkaz/
├── src/                 # React frontend
│   ├── api/             # Axios client
│   ├── components/      # UI komponentlar
│   ├── hooks/           # Custom hooks (useFirestore, useCrmData)
│   ├── pages/           # Sahifalar
│   │   ├── crm/         # CRM modullari (21 ta sahifa)
│   │   └── portal/      # Talaba portali
│   └── utils/           # Yordamchi funksiyalar
├── server/              # Express backend
│   ├── middleware/       # Auth middleware (JWT + RBAC)
│   └── routes/          # API marshrutlar
├── prisma/              # Ma'lumotlar bazasi sxemasi
├── ecosystem.config.cjs # PM2 konfiguratsiya
└── vite.config.ts       # Frontend build konfiguratsiya
```

## 🔑 Rol Tizimi

| Rol | Huquq |
|-----|-------|
| `ADMIN` | Barcha modullarga to'liq kirish |
| `MANAGER` | Talabalar, guruhlar, lidlar, moliya (ko'rish), marketing |
| `TEACHER` | O'z guruhlari, davomat, jurnal, baholash |
| `STUDENT` | Faqat o'z portali |
