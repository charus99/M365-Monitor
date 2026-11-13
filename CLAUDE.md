# CLAUDE.md — M365 Service Health Monitor

## What this project is
Dashboard สาธารณะแสดงสถานะ Microsoft 365 ของ tenant เรา Cloudflare Worker poll Graph API
ทุก 5 นาที (fallback: Public RSS) เก็บ `status.json` ใน KV และเสิร์ฟหน้าเว็บบน `*.workers.dev`

## Tech stack
- Language / runtime: TypeScript บน Cloudflare Workers (Cron Trigger + KV + static assets)
- Key libraries: Wrangler, Vitest
- Target systems: Microsoft Graph (production tenant, read-only), `status.cloud.microsoft` RSS + `/api/posts/m365Consumer` (undocumented JSON)

## Commands
- Install: `npm install` (npm อาจเตือนเรื่อง install scripts ของ esbuild/workerd — ไม่ต้อง approve, binary มากับ optional deps)
- Run: `npm run dev` → http://127.0.0.1:8799 (พอร์ต 8787 ใช้โดย project อื่นในเครื่อง)
- Test: `npm test`
- Type check: `npm run typecheck`
- Deploy: `npm run deploy` (ต้อง `npx wrangler login` ก่อน; URL จริงดูจาก output — อย่าใส่ใน repo)
- ดู log production: `npx wrangler tail m365-monitor --format pretty`
- ทดสอบ cron ในเครื่อง: `npx wrangler dev --port 8799 --test-scheduled` แล้วเปิด `http://127.0.0.1:8799/__scheduled?cron=*/5+*+*+*+*` (ดึง RSS จริง) จากนั้นดู `/status.json`

## Structure
- `src/` — Worker code (`index.ts` = entry)
- `public/` — static assets ที่เสิร์ฟ (`index.html` = หน้า dashboard)
- `test/` — Vitest tests
- `M365_HEALTH_MONITOR_SPEC.md` — spec ต้นฉบับ (schema, UI, data source)
- `docs/mockup/` — mockup UI อ้างอิง (ต้องทำหน้าเว็บให้ตรง)
- `docs/STATUS.md` — progress and decisions (keep updated)
- `docs/REQUIREMENTS.md` — scope and out-of-scope
- `docs/TECH-STACK.md` — stack และการจัดการ secret

## Project rules
- ถ้า spec ขัดกับ `docs/REQUIREMENTS.md` / `docs/TECH-STACK.md` ให้ยึด docs (spec พูดถึง Python, Telegram, `state.json` บนดิสก์ — ถูกแทนแล้ว)
- Browser ห้ามเรียก Graph หรือ RSS ตรง — ทุกอย่างผ่าน Worker
- Escape ข้อความจาก Graph/RSS ทุกฟิลด์ก่อนใส่ HTML
- Parser/mapping เป็น pure function แยกจาก I/O เพื่อให้ unit test ได้
- ระวังโควตา plan Free: KV writes ≤ 1,000/วัน, `/status.json` ต้อง cache (ดู memo ใน `src/index.ts`)

## Test / lab environment
- ไม่มี tenant ทดสอบ — Graph คือ production (read-only) ใช้ fixture/mocked fetch ใน unit test
- Credentials: `.dev.vars` ในเครื่อง (ดู `.dev.vars.example`), production ใช้ `wrangler secret put`

## Out of scope
- Telegram (v1), login, หลาย tenant, custom domain
