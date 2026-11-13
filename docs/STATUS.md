# Status — M365 Service Health Monitor

## Milestones
- [x] 1. Scaffold: Wrangler + TypeScript + Vitest, ย้าย mockup ไป `docs/mockup/` — verify: `npm test` รันได้, `wrangler dev` เปิดหน้า mockup ได้
- [x] 2. Parsers (pure functions): strip HTML/entity, mojibake, "Next update by", RSS → schema — verify: unit tests ผ่านด้วย fixture จาก feed จริง
- [x] 3. RSS pipeline: cron → KV → `GET /status.json` (memory cache) — verify: `wrangler dev --test-scheduled` แล้วได้ JSON ตรง schema
- [x] 4. Frontend: แปลง mockup ให้อ่าน `status.json` — verify: fixture 4 แบบ (incident / ว่าง / stale / rss) ทั้ง light และ dark
- [ ] 5. Graph: token, issues, healthOverviews, paging, retry, fallback counter — verify: unit tests ด้วย mocked fetch + รันกับ tenant จริงผ่าน `wrangler dev` — **โค้ด + unit tests เสร็จ, รอทดสอบกับ tenant จริง (ต้องมี App Registration)**
- [ ] 6. Deploy: secrets + cron ทำงานบน `*.workers.dev` — verify: URL แสดงข้อมูลจริง, `generatedAt` ขยับทุก 5 นาที — **deploy แบบ RSS-only แล้ว (ยังไม่มี secrets); cron รอบแรกเขียนข้อมูลสำเร็จ, หน้าเว็บแสดงข้อมูลจริง**

## Decisions log
- 2026-11-13 — เป็น project แยก ไม่รวมกับ project อื่น — ผู้ใช้ตัดสินใจ (spec เดิมให้รวมกับ project Python)
- 2026-11-13 — ตัด Telegram ออกจาก v1 — เอาแค่ดูผ่านเว็บก่อน; ทำให้ไม่ต้องมี state diff ใน v1
- 2026-11-13 — เปิดหน้าเว็บเป็น public ไม่ต้อง login — ยอมรับการเปิดเผยข้อมูล tenant
- 2026-11-13 — Stack: Cloudflare Worker (TypeScript) + Cron + KV บน `*.workers.dev` plan Free — ฟรี, cron ตรงเวลา, รองรับ Telegram ภายหลัง (แทน Python ใน spec)
- 2026-11-13 — ทำทั้ง Graph และ RSS fallback ใน v1 — App Registration จะสร้างคู่ขนาน
- 2026-11-13 — RSS URL `https://status.cloud.microsoft/api/feed/mac`; map: id=guid, service=title, classification=incident, services ใช้ชุดล่าสุดจาก Graph — RSS ไม่มีฟิลด์เหล่านี้
- 2026-11-13 — Milestone 1 เสร็จ: wrangler 4.161, TypeScript 7, Vitest 5; static assets จาก `public/`, `public/index.html` ยังเป็นสำเนา mockup (แปลงใน milestone 4); dev port 8799
- 2026-11-13 — Milestone 2 เสร็จ: `src/text.ts` (decodeEntities, stripHtml, fixMojibake, parseNextUpdateBy), `src/rss.ts` (regex-based เพราะ Workers ไม่มี DOMParser); RSS description แยกตามหัวข้อ User impact / More info / Current status (ดู REQUIREMENTS); fixture จริง `test/fixtures/rss-mac.xml` (feed ณ 2026-11-13 ไม่มี mojibake จริง — ทดสอบด้วยข้อความสังเคราะห์)
- 2026-11-13 — Milestone 3 เสร็จ: `src/poll.ts` + cron `*/5`; KV binding `STATUS` ไม่ใส่ id (wrangler 4 สร้างให้ตอน deploy); cache `/status.json` ด้วย memory ต่อ isolate 30 วิ แทน Cache API (ไม่แน่ใจว่า Cache API ทำงานบน `*.workers.dev`); poll ล้ม → ไม่เขียนทับ status.json เดิม (หน้าเว็บจะขึ้น Stale เอง)
- 2026-11-13 — Milestone 4 เสร็จ: `public/index.html` อ่าน `status.json` ทุก 60 วิ, escape ทุกฟิลด์, คงสถานะการ์ดที่เปิดไว้ข้าม refresh; ตรวจด้วย Playwright (นอก project) กับ fixture incident / empty / stale / rss / ไม่มีข้อมูล ทั้ง light/dark + มือถือ 390px + e2e บน `wrangler dev`; เพิ่ม banner ส้ม "ข้อมูลไม่อัปเดต" เมื่อ Stale และไม่มี incident (ไม่ให้ขึ้นเขียว "healthy" ทั้งที่ข้อมูลเก่า); status ที่ไม่รู้จักแสดงชื่อดิบด้วย badge สีเทา; service overview = รายชื่อจาก `services` + service ที่มี issue (สีแดงถ้ามี incident, ส้มถ้ามี advisory หรือ status ≠ serviceOperational)
- 2026-11-13 — พบว่า RSS `<guid>` เปลี่ยนทุกครั้งที่ Microsoft อัปเดตข้อความ (incident เดิม) — ไม่กระทบ v1 แต่ Telegram ในอนาคตใช้ guid diff ไม่ได้
- 2026-11-13 — Milestone 5 (โค้ด): `src/graph.ts` token (client credentials ผ่าน fetch), paging `@odata.nextLink` (สูงสุด 20 หน้า), retry 429/5xx/network 3 ครั้ง backoff 1/2/4 วิ หรือ `Retry-After` (สูงสุด 10 วิ), 4xx อื่นไม่ retry; error ไม่มี secret. `poll.ts`: Graph ล้มครั้งแรก → คงข้อมูลเดิม, ครั้งที่ 2 ติด / ไม่มีข้อมูลเดิม / ไม่มี secret → RSS. เปลี่ยนจาก M3: เลิกใช้ KV key `services` (services อยู่ใน status.json แล้ว) ตัวนับล้มอยู่ใน key `state` (private) เขียนเฉพาะตอนค่าเปลี่ยน → ปกติเขียน KV 1 ครั้ง/รอบ
- 2026-11-13 — Deploy ครั้งแรก (RSS-only) ตามที่ผู้ใช้ขอ: KV namespace `m365-monitor-status` ถูกสร้างอัตโนมัติ (ไม่มี id ใน `wrangler.toml`); ผู้ใช้เปลี่ยน workers.dev subdomain ของบัญชีเพื่อไม่ให้มีชื่อบัญชีใน URL — ไม่ใส่ URL จริงใน repo (repo เป็น public); KV write ต้องรอ propagate ~60 วิ ก่อน edge อื่นเห็น
- 2026-11-13 — UI: ตอน `source: "rss"` ซ่อน id (guid), "เริ่ม" และ tile ระยะเวลา เพราะ RSS ไม่มีเวลาเริ่มจริง (pubDate = เวลาอัปเดตล่าสุด) และ guid เปลี่ยนทุกอัปเดต; Service overview แสดง "ยังไม่มีข้อมูล" แทนกล่องว่าง

## Open questions
- App Registration (`ServiceHealth.Read.All` + admin consent) — ผู้ใช้สร้าง, ต้องมีก่อน milestone 5
