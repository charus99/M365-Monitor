# Tech Stack — M365 Service Health Monitor

## Chosen
- Language / runtime: TypeScript บน Cloudflare Workers
- Scheduling: Cron Trigger ทุก 5 นาที (`*/5 * * * *`)
- Storage: Workers KV — `status.json` และ state เล็กๆ (ตัวนับ Graph fail ติดกัน, services ชุดล่าสุดจาก Graph)
- Frontend: HTML/CSS/JS ล้วนจาก mockup เสิร์ฟผ่าน Workers static assets (ไม่มี framework)
- Auth กับ Graph: OAuth2 client credentials ผ่าน `fetch` ตรง (ไม่ใช้ MSAL)
- Tests: Vitest
- Tooling: Wrangler (dev, deploy, secrets)
- Hosting: `*.workers.dev`, plan Free

## Why this stack
ฟรี, cron ตรงเวลา, deploy ชิ้นเดียวจบทั้ง poller และหน้าเว็บ, secret อยู่ใน Worker Secrets
Browser ดึงข้อมูลเองไม่ได้ (Graph ต้องใช้ secret, RSS ไม่มี `Access-Control-Allow-Origin`)
จึงต้องมี Worker อยู่แล้ว เลือกแบบ cron แทน on-demand เพราะ Stale มีความหมายชัด,
ต้นทางถูกเรียกคงที่ 288 ครั้ง/วันไม่ว่าคนเข้าเท่าไหร่ และรองรับ Telegram ในอนาคตโดยไม่ต้องรื้อ

## Options considered
| Option | Why not chosen |
|---|---|
| On-demand Worker (ดึงตอนมีคนเปิด + cache) | ง่ายกว่าเล็กน้อย แต่ Stale ไม่มีความหมาย, ต้องมี cron อยู่ดีถ้าจะทำ Telegram |
| GitHub Actions (Python) cron → Cloudflare Pages | cron ของ GitHub ดีเลย์/ข้ามรอบบ่อย ทำให้ Stale บ่อย; private repo นาทีฟรีไม่พอ |
| Python Workers | ไม่แน่ใจสถานะ beta และความเข้ากันได้ของ library |
| Browser fetch ตรง | ติด CORS (RSS) และต้องเปิดเผย secret (Graph) |

## Secrets & configuration
- Production: `wrangler secret put TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET`
- Local dev: `.dev.vars` (อยู่ใน `.gitignore`) — ตัวอย่างใน `.dev.vars.example`:
  ```
  TENANT_ID=00000000-0000-0000-0000-000000000000
  CLIENT_ID=00000000-0000-0000-0000-000000000000
  CLIENT_SECRET=replace-me
  ```
- ค่าที่ไม่ลับ (RSS URL, KV binding, cron) อยู่ใน `wrangler.toml`
- Graph permission: Application `ServiceHealth.Read.All` + admin consent (read-only)
- ไม่ได้ตั้ง secret ครบ 3 ตัว → poller ใช้ RSS อย่างเดียว (ใช้ dev ได้โดยไม่ต้องมี App Registration)

### สร้าง App Registration (ทำครั้งเดียว, ต้องเป็น admin ที่ grant consent ได้)
1. Microsoft Entra admin center → **App registrations** → **New registration**
   ชื่อ `m365-monitor`, *Accounts in this organizational directory only*, ไม่ต้องใส่ Redirect URI
2. **API permissions** → Add a permission → Microsoft Graph → **Application permissions** →
   `ServiceHealth.Read.All` → **Grant admin consent for <tenant>** (สถานะต้องเป็นเครื่องหมายถูกสีเขียว)
   — ลบ `User.Read` (delegated) ที่ติดมาโดย default ได้ ไม่ได้ใช้
3. **Certificates & secrets** → New client secret → จด **Value** ทันที (ดูได้ครั้งเดียว)
   และจดวันหมดอายุไว้ — secret หมดอายุ = Graph ล้ม → หน้าเว็บจะตกไปใช้ RSS fallback
4. หน้า **Overview** → จด *Directory (tenant) ID* และ *Application (client) ID*
5. ในเครื่อง: คัดลอก `.dev.vars.example` เป็น `.dev.vars` แล้วใส่ 3 ค่า (ห้าม commit)
   Production: `npx wrangler secret put TENANT_ID` / `CLIENT_ID` / `CLIENT_SECRET`
