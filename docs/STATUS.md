# Status — M365 Service Health Monitor

## Milestones
- [ ] 1. Scaffold: Wrangler + TypeScript + Vitest, ย้าย mockup ไป `docs/mockup/` — verify: `npm test` รันได้, `wrangler dev` เปิดหน้า mockup ได้
- [ ] 2. Parsers (pure functions): strip HTML/entity, mojibake, "Next update by", RSS → schema — verify: unit tests ผ่านด้วย fixture จาก feed จริง
- [ ] 3. RSS pipeline: cron → KV → `GET /status.json` (edge cache) — verify: `wrangler dev --test-scheduled` แล้วได้ JSON ตรง schema
- [ ] 4. Frontend: แปลง mockup ให้อ่าน `status.json` — verify: fixture 4 แบบ (incident / ว่าง / stale / rss) ทั้ง light และ dark
- [ ] 5. Graph: token, issues, healthOverviews, paging, retry, fallback counter — verify: unit tests ด้วย mocked fetch + รันกับ tenant จริงผ่าน `wrangler dev`
- [ ] 6. Deploy: secrets + cron ทำงานบน `*.workers.dev` — verify: URL แสดงข้อมูลจริง, `generatedAt` ขยับทุก 5 นาที

## Decisions log
- 2026-11-13 — เป็น project แยก ไม่รวมกับ project อื่น — ผู้ใช้ตัดสินใจ (spec เดิมให้รวมกับ project Python)
- 2026-11-13 — ตัด Telegram ออกจาก v1 — เอาแค่ดูผ่านเว็บก่อน; ทำให้ไม่ต้องมี state diff ใน v1
- 2026-11-13 — เปิดหน้าเว็บเป็น public ไม่ต้อง login — ยอมรับการเปิดเผยข้อมูล tenant
- 2026-11-13 — Stack: Cloudflare Worker (TypeScript) + Cron + KV บน `*.workers.dev` plan Free — ฟรี, cron ตรงเวลา, รองรับ Telegram ภายหลัง (แทน Python ใน spec)
- 2026-11-13 — ทำทั้ง Graph และ RSS fallback ใน v1 — App Registration จะสร้างคู่ขนาน
- 2026-11-13 — RSS URL `https://status.cloud.microsoft/api/feed/mac`; map: id=guid, service=title, classification=incident, services ใช้ชุดล่าสุดจาก Graph — RSS ไม่มีฟิลด์เหล่านี้

## Open questions
- App Registration (`ServiceHealth.Read.All` + admin consent) — ผู้ใช้สร้าง, ต้องมีก่อน milestone 5
- Node.js และบัญชี Cloudflare พร้อมในทุกเครื่องหรือยัง
