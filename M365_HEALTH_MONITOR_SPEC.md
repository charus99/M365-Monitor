# M365 Service Health Monitor — Spec สำหรับ implement

## เป้าหมาย
ทำ dashboard ติดตามสถานะ Microsoft 365 ของ tenant เราแบบ near real-time (poll ทุก 5 นาที)
และส่งแจ้งเตือน Telegram เมื่อมี issue ใหม่, มี update, หรือ resolved
ให้รวมเข้ากับ project ที่มีอยู่ (ใช้ Python, Telegram, config/secret pattern เดิมของ project)

## Reference UI
- ไฟล์ mockup: `docs/mockup/m365-service-health-monitor.html`
- **ต้องทำ layout, สี, component และพฤติกรรมให้ตรงกับ mockup นี้** (ทั้ง light/dark mode)
- ข้อมูลใน mockup เป็นข้อมูลสมมติที่ hardcode ไว้ใน `const issues` / `const services`
  → ให้เปลี่ยนเป็นการ fetch `status.json` จริง โดยคง rendering logic เดิมไว้ให้มากที่สุด

### องค์ประกอบใน mockup (ต้องมีครบ)
1. Header: ชื่อ, แหล่งข้อมูล, เวลา poll ล่าสุด (**ต้องเป็นเวลาจริงจาก `generatedAt`** ไม่ใช่เวลาเปิดหน้า)
2. Banner สีแดง: แสดงเมื่อมี `classification == "incident"` ที่ยังไม่ resolved — โชว์ id, สรุป, "Next update by" (ถ้ามี) เป็นเวลาไทย
   ไม่มี incident → ซ่อน banner (หรือแสดง banner สีเขียว "All services healthy")
3. Tiles 4 ช่อง: จำนวน incident ที่เปิด, จำนวน advisory ที่เปิด, จำนวน service ที่ได้รับผลกระทบ, ระยะเวลาของ incident ที่เปิดนานที่สุด (คำนวณจาก `startDateTime` ถึงตอนนี้)
4. Active issues: การ์ดแบบ `<details>` กดขยายได้, แถบซ้ายสีแดง=incident / ส้ม=advisory, badge ตาม `status`, timeline ของ `posts` เรียงใหม่→เก่า
5. Filter chips: ทั้งหมด / Incident / Advisory
6. Service overview: รายชื่อ service พร้อมจุดสี (เขียว Healthy / ส้ม Advisory / แดง Incident)
7. Badge ข้อมูลตัวอย่าง → เปลี่ยนเป็น badge แหล่งข้อมูล: `Graph` (ปกติ), `RSS fallback` (ส้ม), `Stale` (แดง ถ้า `generatedAt` เก่ากว่า 15 นาที)

เวลาทั้งหมดแสดงเป็น Asia/Bangkok

## สถาปัตยกรรม
```
[poller.py]  --ทุก 5 นาที-->  Graph API  (fallback: Public RSS)
     |
     +--> status.json  (หน้าเว็บอ่าน)
     +--> state.json   (เก็บ lastModifiedDateTime ของแต่ละ issue เพื่อ diff)
     +--> Telegram     (เฉพาะเมื่อมีการเปลี่ยนแปลง)

[index.html] --fetch status.json ทุก 60 วิ--> render
```
- ห้าม browser เรียก Graph ตรง (ห้ามมี client secret ในฝั่งหน้าเว็บ)
- เสิร์ฟหน้าเว็บ + status.json ผ่าน web server (ไม่ใช่ `file://` เพราะ fetch จะติด CORS)

## Data source

### 1) Graph API (หลัก)
- Auth: client credentials (MSAL), Application permission `ServiceHealth.Read.All` + admin consent
- Env: `TENANT_ID`, `CLIENT_ID`, `CLIENT_SECRET` (ใช้วิธีเก็บ secret แบบเดียวกับที่ project ใช้อยู่)
- Issues: `GET https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues?$filter=isResolved eq false`
- Service list: `GET https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/healthOverviews`
- ฟิลด์ที่ใช้: `id, title, service, feature, classification (incident|advisory), status, isResolved,
  startDateTime, lastModifiedDateTime, impactDescription, posts[].createdDateTime, posts[].description.content`
- `posts[].description.content` เป็น HTML → strip tag / decode entity ก่อนเก็บ
- ดึง "Next update by: ..." จาก post ล่าสุดด้วย regex ถ้ามี
- รองรับ paging (`@odata.nextLink`) และ retry 429/5xx แบบ backoff

### 2) Public RSS (fallback)
- URL: `<ใส่ RSS URL ที่ใช้อยู่>`
- ใช้เมื่อ Graph timeout / error เกิน 2 ครั้งติด
- `<description>` เป็น HTML ที่ถูก escape และมี encoding เพี้ยน (เช่น `Weâ€™re`) → unescape + แก้ mojibake (เช่น `ftfy`)
- map เป็น schema เดียวกับ Graph ให้มากที่สุด, ตั้ง `source: "rss"`

## status.json schema
```json
{
  "generatedAt": "2026-11-13T02:31:00Z",
  "source": "graph",
  "lastGraphSuccessAt": "2026-11-13T02:31:00Z",
  "issues": [
    {
      "id": "EX1234567",
      "title": "Users may be unable to connect to multiple Microsoft 365 services",
      "service": "Exchange Online",
      "feature": "E-Mail and calendar access",
      "classification": "incident",
      "status": "restoringService",
      "start": "2026-11-12T19:40:00Z",
      "modified": "2026-11-13T01:58:00Z",
      "impact": "plain text",
      "nextUpdateBy": "2026-11-13T03:00:00Z",
      "posts": [{ "at": "2026-11-13T01:58:00Z", "text": "plain text" }]
    }
  ],
  "services": [{ "name": "Exchange Online", "status": "serviceDegradation" }]
}
```
เขียนไฟล์แบบ atomic (เขียน temp แล้ว rename) กันหน้าเว็บอ่านไฟล์ครึ่งๆ

## Telegram alert
- issue ใหม่ → `🔴/🟠 [INCIDENT|ADVISORY] {id} – {service}\nStatus: {status}\n{title}`
- `lastModifiedDateTime` เปลี่ยน → ส่ง update พร้อมข้อความ post ล่าสุด (ตัดไม่เกิน ~500 ตัวอักษร)
- issue หายจาก list หรือ `isResolved=true` → `✅ {id} resolved`
- สลับเป็น RSS fallback / Graph กลับมา → แจ้ง 1 ครั้ง
- ห้ามส่งซ้ำถ้าไม่มีอะไรเปลี่ยน

## Acceptance criteria
- [ ] หน้าเว็บหน้าตาตรงกับ mockup และไม่มีข้อมูล hardcode เหลืออยู่
- [ ] เวลา poll ล่าสุดมาจาก `generatedAt` จริง; เกิน 15 นาทีแสดง Stale
- [ ] ไม่มี issue → แสดง empty state / All healthy ได้ถูกต้อง
- [ ] Graph ล่ม → fallback RSS ทำงาน, badge เปลี่ยนเป็น RSS fallback
- [ ] Telegram ไม่ spam (ส่งเฉพาะตอนมีการเปลี่ยนแปลง)
- [ ] secret ไม่อยู่ใน repo / ไม่อยู่ฝั่ง browser
- [ ] มี unit test สำหรับ: diff state, parse RSS, strip HTML, parse "Next update by"
