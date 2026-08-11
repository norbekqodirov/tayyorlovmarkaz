# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tayyorlov Markazi CRM — a SaaS-style management system for a private tutoring/prep
center (o'quv markaz): students, groups/courses, HR, finance, marketing/leads,
Telegram bots for students+parents and staff, Face ID attendance, analytics.
UI and commit messages are in Uzbek; keep new user-facing text and commit
messages in Uzbek to match the existing codebase.

## Commands

```bash
npm run dev             # frontend (Vite :3000) + backend (tsx watch :3001) together
npm run server           # backend only
npx tsc --noEmit          # type-check — MUST be 0 errors after any change (= npm run lint)
npm run build             # production build → dist/
npm run preview           # preview the production build

npx prisma db push --accept-data-loss   # apply schema.prisma changes to the DB
npx prisma generate                      # regenerate Prisma Client (needed after schema edits)
npx prisma studio                        # DB GUI
```

There is no automated test suite. Verification = `npx tsc --noEmit` (must be clean)
plus, for anything user-visible, driving the feature in a browser.

Single dev server session: `.claude/launch.json` defines `Vite Frontend` (full
`npm run dev`) and `Vite Only` (just vite, for when a backend is already running
elsewhere — e.g. another agent session's `tsx watch` is still up on :3001).

## Database: PostgreSQL only, always `db push`

- `datasource db` in `prisma/schema.prisma` is `postgresql`. `prisma/dev.db` is a
  dead SQLite file from an earlier phase — ignore it, it is not read by the app.
- **Never use `prisma migrate`.** This project has no migrations directory in
  active use; schema changes go live via `npx prisma db push --accept-data-loss`
  on the local dev DB.
- **Production data must never be lost on deploy.** `deploy.sh` (run on the
  server) does `git pull` + a schema.prisma sed-patch (server runs SQLite —
  see "Production uses SQLite" below) + `npm install` + `prisma generate` +
  `npm run build` + `pm2 restart`. It intentionally does **not** run `db push`
  or anything destructive. If a schema change ever needs to reach production,
  treat it as additive-only (new nullable columns/tables), back up first, and
  never drop or rename existing columns without an explicit, separate,
  confirmed step.
- **Deploy workflow (2026-08-11 on):** ordinary deploys are just `git push`
  (local) + `bash deploy.sh` (on the server, via SSH — the agent cannot run
  this itself, entering the SSH password is off-limits; give the user the
  exact commands and let them run it). `deploy.sh` now builds the frontend
  itself (`dist/` stays gitignored, rebuilt fresh each deploy) — no more
  manual local `npm run build` → `tar` → `scp` → extract dance. If a schema
  change shipped, the user still runs `npx prisma db push --accept-data-loss`
  on the server manually as a separate, deliberate step before/after
  `deploy.sh` — never bundle that into the script.
- **Production uses SQLite, not PostgreSQL.** The server has
  `git update-index --skip-worktree prisma/schema.prisma` set, with a
  SQLite-flavored schema.prisma (`provider = "sqlite"`, no `@db.Text`) that
  `git pull` does not overwrite. This is a real, working split — don't try to
  "fix" it by unifying providers without understanding this is deliberate.

## Architecture

### Generic CRUD is the backbone — and its footguns

Most collections (`students`, `groups`, `leads`, `courses`, `finance`, …) are
NOT hand-written REST endpoints. `server/routes/crud.ts` is a single generic
router mounted at `/api` (last, after all specific routers) that maps a URL
segment to a Prisma model via `MODEL_MAP` and does `prisma[modelName].findMany/
create/update/delete`. `SCHEMA_FIELDS` is a per-model **whitelist** — any field
in a request body not listed there is silently dropped before it reaches
Prisma. Frontend code that was written against an older/different field shape
than the current `schema.prisma` fails silently this way (this has been the
root cause of several "the save button does nothing" bugs — e.g. `Group` used
to be sent `subject`/`teacher`/`room`/`days`/`students`/`price` when the model
only had `courseId`/`teacherId`/`maxSize`). **When adding a field a form needs
to persist, it must be added to both `schema.prisma` and `SCHEMA_FIELDS`.**

Collections not in `MODEL_MAP` (and not matching a real Prisma model name)
fall back to `GenericDocument` (a JSON-blob table, collection+data). This is
legacy — real models are preferred; only use the fallback for genuinely
freeform/rarely-queried data.

Two more things the generic layer handles that are easy to miss:
- **`RELATION_INCLUDES`**: some models need related data joined in for the
  frontend to render anything useful (e.g. `group` needs `course`/`teacher`
  names and an enrollment count, not just raw FK ids). If a list/detail
  response looks like it's missing obviously-needed related data, check here
  before assuming the frontend is broken.
- **`JSON_TEXT_FIELDS`**: a few Prisma fields are `String @db.Text` holding a
  JSON-encoded array/object (e.g. `Attendance.records`, `GroupSchedule.days`)
  because the frontend works with them as arrays. `stringifyJsonFields`/
  `parseJsonFields` convert at the crud.ts boundary. If you add a new field
  like this, register it here — Prisma will otherwise reject a raw array being
  written into a String column.

Students are linked to groups via the `Enrollment` join table, **not** an
array field on `Group` or `Student` — there is no `Group.students`. Use
`POST /api/enrollments` / `DELETE /api/enrollments/remove`, not a generic
`updateDocument` call with a `students` array (that field doesn't exist and
gets silently dropped, same footgun as above).

### Two API trust zones

Everything under `/api/:collection` (crud.ts) and most feature routers require
`requireAuth` (JWT `Authorization: Bearer`) — including GET, with three
explicit exceptions in `PUBLIC_READ_COLLECTIONS` (`pageContent`, `gallery`,
`news`, `teachers`) needed so the public marketing site can read its own
landing content without a login. **`server/routes/public.ts`** is the other
deliberate no-auth surface: lead capture from the public site
(`POST /api/public/lead`) and the lead-form's dynamic extra-field config.
Any new feature meant for anonymous visitors (not logged-in CRM users, not
Telegram-authenticated parents) belongs here, not in crud.ts — the generic
router's auth is on by default.

Telegram Mini Apps (`/portal`, `/staff-portal`) use a third auth mode,
`portalAuth` in `server/routes/portal.ts` / `staffPortal.ts`: a signed URL
token from the bot, or `Telegram.WebApp.initData` validated server-side —
never a CRM JWT.

### Role/permission model

JWT payload carries `role` (`TEACHER` < `MANAGER` < `ADMIN` < `SUPER_ADMIN`,
see `ROLE_LEVEL` in `server/middleware/auth.ts`) plus an optional
`permissions` JSON array set per-user in `CrmUsers.tsx`. `ProtectedRoute.tsx`
(`canAccess`) and `crud.ts`'s `requireRole` both special-case ADMIN/SUPER_ADMIN
as "always allowed". The important subtlety: **if a user has a non-empty
custom `permissions` array, `requiredPermission` alone decides access —
`allowedRoles` is ignored.** So a route meant to be reachable by TEACHER must
have its required permission key present in the TEACHER template in
`CrmUsers.tsx`'s `ROLE_TEMPLATES`, not just be listed in `allowedRoles`.
Adding a new permission-gated page = add the permission to `ALL_PERMISSIONS`,
add it to the relevant `ROLE_TEMPLATES`, and use it consistently as both the
nav link's `permission` in `CrmLayout.tsx` and the route's `requiredPermission`
in `App.tsx`.

### CRM navigation: one source of truth

`src/components/CrmLayout.tsx`'s `MODULES` array is the only place nav
structure is defined. `findActiveLink(pathname)` derives which module/link is
active by longest-prefix match; `detectModule`/`getPageTitle` are generated
from it — **do not hand-edit them**. Adding a page = add a link to `MODULES`
+ a route in `App.tsx`; nothing else needs to change.

### Telegram surfaces (two bots, two Mini Apps)

- Student/parent bot: grammY (`server/bot/index.ts`), webhook at
  `/api/telegram/webhook`. Needs `TELEGRAM_BOT_TOKEN` in the actual process
  env (not just the DB `Setting` row grammY reads elsewhere from).
- Staff bot: raw Telegram HTTP API, hand-rolled in
  `server/routes/staffTelegram.ts` — no grammY, no env var requirement.
- Mini Apps: `TelegramPortal.tsx` (students/parents, tabs: home, attendance,
  payments, grades, schedule, chat) and `StaffPortal.tsx` (staff, Face ID
  check-in/out). Bot settings (tokens, mini-app URLs, auto-notify flags) live
  as key/value rows in the `Setting` model, read/written via
  `server/routes/telegram.ts`'s `/settings` endpoint.
- Parent↔staff chat reuses the generic `Message` model (which has no FK on
  sender/receiver — just strings) with a synthetic id scheme:
  `student:{studentId}` for the parent side, `staff:manager` (shared inbox)
  or `staff:teacher:{teacherId}` for the staff side. See
  `server/routes/parentChat.ts` / the chat section of `portal.ts`.

### Billing: computed, not stored

Monthly student payment due is **not** a stored field — it's computed on
request by `server/services/billing.ts` from real `AttendanceRecord` rows for
the month plus `Group.price` (falls back to `Course.price`), against two
admin-configurable `Setting` values (`monthly_lessons_count`,
`absence_discount_threshold`): more than the threshold absences in a given
group this month discounts that group's price proportionally; ≤ threshold
means full price. Teacher payroll (`CrmTeachers.tsx`) is a percentage
(`teacher_salary_percent` setting) of the sum of students' *actual*
(already-discounted) monthly due across their groups — never a raw
`price × studentCount` estimate, which ignores absences and (before the
`Enrollment` fix above) was often reading a nonexistent field anyway.

### Face ID attendance

Client-side face matching in `src/components/portal/FaceIdCheckin.tsx` using
`face-api.js`, because the production server has no root access for a
server-side face pipeline. Registration stores a 128-length descriptor
(`StaffFaceProfile.descriptor`, JSON string); check-in/out re-extracts a
descriptor and compares Euclidean distance (< 0.5) against the stored one —
liveness via eye-aspect-ratio blink detection, not a bypass. This has had many
iterative fixes around model-loading reliability on mobile Telegram WebView;
if touching it, test on an actual phone inside Telegram, not just desktop
Chrome.

### Timezone

Attendance/date logic must go through `server/utils/timezone.ts` (Tashkent,
UTC+5) rather than `new Date()` / `Date.now()` directly — the server's own
system timezone is not guaranteed to be Tashkent.
