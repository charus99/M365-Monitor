# Requirements — M365 Service Health Monitor

## Goal
Dashboard สาธารณะแสดงสถานะ Microsoft 365 ของ tenant เราแบบ near real-time (poll ทุก 5 นาที)
ใช้ Graph API เป็นแหล่งหลัก และ Public RSS เป็น fallback หน้าตาตาม mockup

## Users
คนทั่วไป — เปิดเป็น public ไม่ต้อง login
(ยอมรับแล้วว่าข้อมูล service health ของ tenant จะถูกเปิดเผยสาธารณะ)

## Version 1 — must have
- [ ] Cron Worker poll ทุก 5 นาที
- [ ] Graph: `GET /v1.0/admin/serviceAnnouncement/issues?$filter=isResolved eq false` และ `/healthOverviews`
      — รองรับ paging (`@odata.nextLink`) และ retry 429/5xx แบบ backoff
- [ ] Fallback เป็น RSS `https://status.cloud.microsoft/api/feed/mac` เมื่อ Graph ล้มติดกัน 2 ครั้ง
- [ ] Strip HTML / decode entity / แก้ mojibake ของข้อความ post และ description
- [ ] ดึง "Next update by: ..." จาก post ล่าสุดด้วย regex
- [ ] เก็บ `status.json` ใน KV ตาม schema ใน [M365_HEALTH_MONITOR_SPEC.md](../M365_HEALTH_MONITOR_SPEC.md) แล้วเสิร์ฟพร้อม edge cache
- [ ] หน้าเว็บตรงกับ mockup ครบทุกองค์ประกอบ (light/dark) อ่าน `status.json` ทุก 60 วิ
  - [ ] Header แสดงเวลา poll จาก `generatedAt`
  - [ ] Banner แดงเมื่อมี incident ที่เปิดอยู่ / เขียว "All services healthy" เมื่อไม่มี
  - [ ] Tiles 4 ช่อง คำนวณจากข้อมูลจริง (รวมระยะเวลา incident ที่เปิดนานที่สุด)
  - [ ] การ์ด issue + timeline posts ใหม่→เก่า, filter chips ทั้งหมด/Incident/Advisory
  - [ ] Service overview ใช้ `services[].status`
  - [ ] Badge แหล่งข้อมูล: `Graph` / `RSS fallback` (ส้ม) / `Stale` (แดง, `generatedAt` เก่ากว่า 15 นาที)
  - [ ] Empty state เมื่อไม่มี issue
  - [ ] Escape ข้อความทุกฟิลด์ก่อนใส่ HTML
  - [ ] เวลาทั้งหมดแสดงเป็น Asia/Bangkok
- [ ] Unit tests: strip HTML, parse "Next update by", parse RSS, แก้ mojibake

### การ map RSS → schema (ตกลงแล้ว)
- `id` = `<guid>`, `service` = `<title>`, `classification` = `"incident"` (feed มีแต่ incident ใหญ่)
- `status` = `<status>` แปลงเป็น camelCase แบบ Graph (เช่น `ServiceDegradation` → `serviceDegradation`)
- `start`/`modified` = `<pubDate>`, `impact`/`posts` จาก `<description>`
- ตอนอยู่ใน RSS fallback: `services` ใช้รายชื่อชุดล่าสุดที่ได้จาก Graph (เก็บใน KV)

## Later — nice to have
- Telegram alert (issue ใหม่ / update / resolved / สลับแหล่งข้อมูล) — ต้องมี state diff + test

## Out of scope
- Telegram ใน v1
- Login / จำกัดสิทธิ์การเข้าดู
- หลาย tenant
- Custom domain (ใช้ `*.workers.dev`)
- Browser เรียก Graph หรือ RSS ตรง (Graph ต้องใช้ secret, RSS ไม่มี CORS header)

## Environment & constraints
- Runs on: Cloudflare Workers (plan Free) + Cron Trigger + KV, URL `*.workers.dev`
- Talks to: Microsoft Graph (production tenant, read-only), `status.cloud.microsoft` RSS (public)
- Credentials: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET` ใน Worker Secrets; ในเครื่องใช้ `.dev.vars` (ไม่ commit)
- Free plan limits: KV 1,000 writes/วัน (ใช้ ~288), 100k reads/วัน → ต้องมี edge cache บน `/status.json`

## Done criteria for version 1
- หน้าเว็บบน `*.workers.dev` หน้าตาตรง mockup และไม่มีข้อมูล hardcode เหลือ
- เวลา poll มาจาก `generatedAt` จริง และ `generatedAt` ขยับทุก ~5 นาที; เกิน 15 นาทีขึ้น Stale
- ไม่มี issue → แสดง empty state / All healthy ถูกต้อง
- Graph ล่ม (เช่น secret ผิด) → ภายใน 2 รอบเปลี่ยนเป็น RSS และ badge เป็น RSS fallback
- Secret ไม่อยู่ใน repo และไม่อยู่ฝั่ง browser
- Unit tests ตามรายการข้างบนผ่านทั้งหมด

## Open questions
- App Registration พร้อม `ServiceHealth.Read.All` + admin consent — ผู้ใช้สร้างเอง (ต้องมีก่อน milestone 5)
