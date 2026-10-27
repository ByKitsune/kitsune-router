# Kitsune Router

**Your models. Your routes.**

เกตเวย์ AI แบบ local-first ที่เป็นกลางต่อผู้ให้บริการ ดูแลและสนับสนุนโดย [ByKitsune](https://bykitsune.com) คุณเลือกโมเดล บัญชี และลำดับ fallback ได้เอง ไม่ต้องมีบัญชี ByKitsune หรือซื้อ API แบบโฮสต์ คำขอยังส่งไปยัง upstream ที่ตั้งค่าไว้ จึงไม่ใช่การประมวลผลแบบออฟไลน์

[English](../README.md) · [คลังโค้ด](https://github.com/ByKitsune/kitsune-router) · [การเปลี่ยนแปลง](../CHANGELOG.md) · [การย้ายข้อมูล](../docs/MIGRATION.md)

## สถานะและการติดตั้ง

**ตรวจสอบซอร์ส 1.0.2 แล้ว แต่การเผยแพร่ npm/GHCR ถูกบล็อก** tag คงที่ `65c8b97d`: ผ่าน 9,041 ข้าม 100 ไม่มี assertion/suite ล้มเหลว lint เข้มงวดและ build app/docs ผ่าน npm publish ถูกปฏิเสธ E403 (ต้องใช้ 2FA หรือ granular token ที่เปิด bypass 2fa) อ่านสาธารณะยัง HTTP 404 GHCR ผ่าน gate/login แต่ preflight ตีความ manifest ที่ไม่มีผิด จึงหยุดก่อน build/push ผู้ใช้จะเปลี่ยน token เองใน GitHub UI ยังไม่ยืนยันเสร็จ recovery แยกไม่เปลี่ยนเวอร์ชัน/tag ยังไม่มีแพ็กเกจ อิมเมจหลัก หรือ GitHub Release ที่ยืนยันเผยแพร่แล้ว แพ็กเกจ `@bykitsune/router` คำสั่ง `kitsune-router` ใช้หลังยืนยันเผยแพร่เท่านั้น ระหว่างนี้ใช้ซอร์ส [สถานะ 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md)

ไม่ย้าย tag: `v1.0.1` ที่ `74583402` ผ่าน SSH/CI แต่ gate GHCR ล้มเหลวก่อน login/push จึงไม่มีอิมเมจหลัก คำสั่ง npm publish ล้มเหลวโดยยังไม่ทราบสาเหตุ อ่าน registry สาธารณะได้ HTTP 404 เมื่อ 2026-10-27 และไม่ได้สร้าง GitHub Release ส่วน `v1.0.0` ที่ `390a6567` ไม่มี npm/GHCR หลัง test ย้ายข้อมูลล้มเหลว [บันทึก 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md) · [ร่าง 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md) นาฬิกาทดสอบและ diagnostic npm ไม่เปลี่ยนลำดับหรือการปฏิเสธ ownership ใน production ผลเก่าไม่ยืนยัน 1.0.2 และคงที่มา 0.x

ต้องใช้ **Node.js >=22.19.0** คำสั่งนี้ใช้หลังเผยแพร่แล้วเท่านั้น:

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# หรือ: npx @bykitsune/router@1.0.2
```

รันจากคลังทางการที่ยืนยันแล้วหรือ checkout ที่มีอยู่ ที่รากคลัง ไม่มีโฟลเดอร์ย่อย `app/`:

สำหรับการติดตั้ง **ใหม่** เท่านั้น ให้สร้าง secret ครั้งเดียวใน `.env` ส่วนตัว (POSIX shell/OpenSSL) `next dev` ไม่เรียกตัวสร้าง secret ของ launcher; หากไม่มี `JWT_SECRET` แบบสุ่มอย่างน้อย 32 ตัวอักษรจะล็อกอินไม่ได้ การย้ายข้อมูลต้องคงค่าเดิมของ `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` และ `DATA_DIR` แบบ absolute ตรวจไฟล์และเปลี่ยนค่าตัวอย่างเฉพาะติดตั้งใหม่ อย่าเผยแพร่หรือ commit `.env`

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

ตั้ง `INITIAL_PASSWORD` ที่ปลอดภัยก่อนเปิดให้เข้าถึง เปิด `http://localhost:20128/dashboard` เชื่อมต่อผู้ให้บริการที่มีสิทธิ์ และสร้าง/คัดลอก key ของเกตเวย์ Base URL คือ `http://localhost:20128/v1` เลือกโมเดลจากรายการจริง `/api/health` ไม่ได้ยืนยันสิทธิ์ upstream

## การเชื่อมต่อ

คำสั่งคือ **`kitsune-router`** แต่คีย์ระบุผู้ให้บริการคือ **`kitsunerouter`** Codex ใช้ `~/.codex/config.toml`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

สร้าง combo ตัวอย่าง `my-route` ก่อน ตัวแปรเก็บ key ที่ออกให้แล้ว ไม่ได้สร้าง key ใหม่ Claude Code ใช้ `ANTHROPIC_BASE_URL=http://localhost:20128` และเติม `/v1/messages` เอง ตรวจ preset และเก็บการตั้งค่าอื่นไว้ [ตัวอย่างเพิ่มเติม](../docs/INTEGRATIONS.md)

## การย้ายข้อมูลและความปลอดภัย

หยุดเกตเวย์เดิมกับ helper และสำรองไดเรกทอรีส่วนตัว**ทั้งหมด** เมื่อเริ่มระบบสามารถย้าย `~/.zenrouter` หรือ `~/.9router` ไป `~/.kitsune-router` (Windows ใช้ `%APPDATA%`) โดยตรวจ snapshot SQLite ที่สอดคล้องและไฟล์ที่คัดลอก เก็บต้นฉบับและไม่เขียนทับปลายทางที่มีอยู่ `DATA_DIR` ที่กำหนดชัดเจนมีสิทธิ์สูงสุดและจะไม่ถูกย้าย

เก็บ `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/`, `mitm/` อย่าเปลี่ยน salt เข้ารหัสหรือ root certificate ที่เชื่อถือแล้วเพียงเพื่อเปลี่ยนชื่อ ไม่รับประกันว่า credential ทั้งหมดเข้ารหัสขณะจัดเก็บ ตัวแปรใหม่คือ `KITSUNE_ROUTER_*`, header คือ `x-kitsune-router-*`, provider คือ `kitsunerouter` ส่วน `/v1/*` และพอร์ต 20128 ไม่เปลี่ยน ไม่จำเป็นต้องมี alias คำสั่ง/provider เดิม

Docker คง volume/mount ที่ `DATA_DIR` จริง ค่าเริ่มต้น `/app/data` หรือ absolute path กำหนดเองที่รองรับ เฉพาะ linux/amd64 บน Linux จำกัดสิทธิ์ให้หยุด/สำรองแล้วใช้ `DATA_DIR` เดิมโดยไม่ย้าย หรือขอตรวจด้วยสิทธิ์เหมาะสม อย่าข้าม permission error ตรวจอิมเมจและ mirror เป็นทางเลือก [ติดตั้ง](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [ปฏิบัติการ](../docs/OPERATIONS.md)

ผลการบีบอัดขึ้นกับงาน ไม่มีเปอร์เซ็นต์ประหยัดคงที่ โควตาไม่จำกัด หรือการรับประกันพร้อมใช้ตลอดเวลา ค่าใช้จ่ายประมาณการไม่ใช่ใบแจ้งหนี้ และราคาไม่ทราบไม่ใช่ฟรี ต้องเคารพสิทธิ์ ภูมิภาค และข้อกำหนด upstream ไม่มีบริการ Kitsune แบบโฮสต์ให้โดยปริยาย และยกเลิก cloud sync เดิมแล้ว การตรวจซอร์ส/ไฟล์ local ไม่ยืนยันการเผยแพร่ registry [หลักฐาน 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md)

## เครดิตและสิทธิ์การใช้งาน

ขอบคุณผู้เขียน/ผู้ร่วมพัฒนา ZenRouter/9Router รวมถึง Joy และ [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman), [Ponytail](https://github.com/DietrichGebert/ponytail) คงประกาศลิขสิทธิ์และที่มาทางประวัติศาสตร์ไว้ MIT: [LICENSE](../LICENSE)
