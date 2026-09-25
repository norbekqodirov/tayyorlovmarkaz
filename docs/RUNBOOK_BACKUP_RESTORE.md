# Backup va tiklash yo'riqnomasi (IP-05)

Bu hujjat production (SQLite, `prisma/prod.db`) uchun. Manba: `server/services/dbBackup.ts`, `scripts/backup_db.ts`, `deploy.sh`.

## 1. Qachon nusxa olinadi

| Hodisa | Qayerdan | Fayl nomi | Fayllar (uploads) |
|---|---|---|---|
| Har kuni 03:30 (Toshkent) | `scheduler.ts` → `runDailyBackup` | `backups/backup-<sana>T<vaqt>-daily.db` | ha, `uploads-...-daily.zip` |
| Har deploy oldidan | `deploy.sh` → `scripts/backup_db.ts pre-deploy` | `...-pre-deploy.db` | yo'q (fayllar deploy'da o'zgarmaydi) |
| Qo'lda (Sozlamalar → Backup) | `POST /api/backup/create` | `...-manual.db` | ha |
| Yuklab olish | `GET /api/auth/backup` | vaqtinchalik nusxa oqim bilan beriladi | yo'q |

- Usul: `VACUUM INTO` — SQLite o'zi bir onlik izchil nusxa yaratadi; faol yozuvlar nusxani buzmaydi (eski `copyFileSync` usulidan farqli). Keyin nusxa `PRAGMA integrity_check` bilan tekshiriladi (Node 22.5+ bo'lsa).
- Saqlash: har tur (baza / fayllar arxivi) bo'yicha oxirgi **14 ta** nusxa qoladi.
- Kunlik backup xato bersa, Telegram admin chatiga (`telegram_admin_chat_id`) xabar keladi.
- O'chirish: `BACKUP_DAILY=off` (tavsiya etilmaydi).

## 2. Server tashqarisiga nusxa (majburiy tavsiya)

Barcha nusxalar serverning o'z diskida — disk ishdan chiqsa hammasi yo'qoladi. `.env`da `BACKUP_COPY_DIR` o'rnating (boshqa diskka ulangan papka, masalan `rclone mount` qilingan bulut papkasi). Har nusxa avtomatik u yerga ham ko'chiriladi va u yerda ham 14 tasi saqlanadi. Bu qadamni server egasi (foydalanuvchi) sozlaydi — hisob ma'lumotlari unda.

## 3. Tiklash (izolyatsiyada sinovdan keyin)

**Hech qachon to'g'ridan-to'g'ri ishlab turgan bazaning ustidan yozmang.** Avval nusxani tekshiring:

1. Nusxani tanlang: `ls -lh backups/`
2. Alohida papkada tekshiring:
   `node -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('backups/<fayl>.db',{readOnly:true});console.log(d.prepare('PRAGMA integrity_check').get(), d.prepare('select count(*) c from Student').get(), d.prepare('select count(*) c from Payment').get())"`
3. Ilovani to'xtating: `pm2 stop tayyorlovmarkaz`
4. Joriy bazani saqlab qo'ying: `cp prisma/prod.db prisma/prod.db.before-restore-$(date +%F-%H%M)`
5. Nusxani qo'ying: `cp backups/<fayl>.db prisma/prod.db`
6. Ishga tushiring: `pm2 start tayyorlovmarkaz` va `curl -sI https://tayyorlovmarkaz.uz/` (200 kutiladi)
7. Tekshiring: login, o'quvchilar soni, oxirgi to'lovlar, oxirgi davomat sanasi.
8. Fayllar kerak bo'lsa: `unzip -o backups/uploads-<...>.zip -d public/uploads`

Nusxa olingan paytdan keyingi yozuvlar (to'lovlar, davomat) tiklangan bazada bo'lmaydi — ularni qayta kiritish kerak. Shuning uchun tiklash — oxirgi chora; kichik xatolar uchun arxiv (IP-01) va tuzatmalardan foydalaning.

## 4. Choraklik tiklash mashqi

Har 3 oyda: eng so'nggi `daily` nusxani lokal kompyuterga yuklab oling (Sozlamalar → Backup → yuklab olish), 2-bandi bo'yicha tekshiring va natijani (sana, qator sonlari) shu faylga qayd eting.

| Sana | Nusxa | integrity_check | Student | Payment | Kim tekshirdi |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
