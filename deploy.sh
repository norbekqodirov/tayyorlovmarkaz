#!/bin/bash
# Server deploy skripti — lokal git pull orqali yangilanish
# Ishlatish: bash deploy.sh
# Serverda: /home/tayyorlovmarkaz/tayyorlovmarkaz/

set -e
set -o pipefail  # `cmd | tail` orqali chiqish kodini yashirmaslik uchun — build/install
                  # xato bersa ham pipe orqasidagi tail 0 qaytarardi, script davom etardi.
cd /home/tayyorlovmarkaz/tayyorlovmarkaz

echo "=== Tayyorlovmarkaz Deploy ==="
echo "Vaqt: $(date)"

# 1. Git pull (schema.prisma skip-worktree bilan himoyalangan)
#    Oldin schema.prisma'ni git holatiga qaytaramiz — 2-qadam uni baribir
#    qayta SQLite'ga o'giradi, shuning uchun bu xavfsiz. Aks holda oldingi
#    deploy'ning sed-patch qilgan versiyasi "local changes would be
#    overwritten by merge" xatosi bilan pull'ni bloklab qo'yardi (bir necha
#    marta shu tufayli deploy qo'lda tuzatilgan edi).
echo ">> git pull..."
git update-index --no-skip-worktree prisma/schema.prisma 2>/dev/null || true
git checkout -- prisma/schema.prisma package-lock.json 2>/dev/null || true
git pull origin master

# 2. SQLite schema.prisma ni tiklash (git pull PostgreSQL versiyasini keltirishi mumkin)
echo ">> schema.prisma SQLite uchun moslashtirish..."
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
sed -i 's/ @db\.Text//' prisma/schema.prisma
# skip-worktree ni qayta o'rnatish (git pull olib tashlashi mumkin)
git update-index --skip-worktree prisma/schema.prisma 2>/dev/null || true

# 3. npm ci — `npm install`dan farqli, package-lock.json'ni HECH QACHON
#    o'zgartirmaydi (aynan shu drift package-lock.json'ni har deploy'da
#    "local changes" qilib, git pull'ni bloklab kelgan edi). devDependencies
#    HAM kerak (vite build shu yerda, frontend endi serverning o'zida
#    qurilyapti — pastga q.).
echo ">> npm ci..."
npm ci --ignore-scripts 2>&1 | tail -5

# 4. Prisma generate (client yangilash)
echo ">> prisma generate..."
node_modules/.bin/prisma generate

# 5. Frontend build (dist/ .gitignore'da, git pull unga tegmaydi —
#    shuning uchun har deploy'da serverning o'zida qayta quriladi).
echo ">> frontend build..."
npm run build 2>&1 | tail -10

# 6. PM2 restart
echo ">> pm2 restart..."
/usr/local/lib/node_modules/pm2/bin/pm2 restart tayyorlovmarkaz

echo "=== Deploy tugadi! ==="
/usr/local/lib/node_modules/pm2/bin/pm2 status tayyorlovmarkaz
