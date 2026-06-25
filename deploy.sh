#!/bin/bash
# Server deploy skripti — lokal git pull orqali yangilanish
# Ishlatish: bash deploy.sh
# Serverda: /home/tayyorlovmarkaz/tayyorlovmarkaz/

set -e
cd /home/tayyorlovmarkaz/tayyorlovmarkaz

echo "=== Tayyorlovmarkaz Deploy ==="
echo "Vaqt: $(date)"

# 1. Git pull (schema.prisma skip-worktree bilan himoyalangan)
echo ">> git pull..."
git pull origin master

# 2. SQLite schema.prisma ni tiklash (git pull PostgreSQL versiyasini keltirishi mumkin)
echo ">> schema.prisma SQLite uchun moslashtirish..."
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
sed -i 's/ @db\.Text//' prisma/schema.prisma
# skip-worktree ni qayta o'rnatish (git pull olib tashlashi mumkin)
git update-index --skip-worktree prisma/schema.prisma 2>/dev/null || true

# 3. npm install (yangi paketlar bo'lsa)
echo ">> npm install..."
npm install --omit=dev --ignore-scripts 2>&1 | tail -5

# 4. Prisma generate (client yangilash)
echo ">> prisma generate..."
node_modules/.bin/prisma generate

# 5. PM2 restart
echo ">> pm2 restart..."
/usr/local/lib/node_modules/pm2/bin/pm2 restart tayyorlovmarkaz

echo "=== Deploy tugadi! ==="
/usr/local/lib/node_modules/pm2/bin/pm2 status tayyorlovmarkaz
