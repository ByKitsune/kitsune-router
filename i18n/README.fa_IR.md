# Kitsune Router

**Your models. Your routes.**

درگاه هوش مصنوعی محلی‌محور و بی‌طرف نسبت به ارائه‌دهندگان، با نگهداری و حمایت [ByKitsune](https://bykitsune.com). مدل‌ها، حساب‌ها و ترتیب مسیر جایگزین را شما انتخاب می‌کنید. حساب ByKitsune یا خرید API میزبانی‌شده الزامی نیست. درخواست‌ها همچنان به ارائه‌دهندگان تنظیم‌شده می‌روند؛ محلی‌محور به معنی استنتاج آفلاین نیست.

[English](../README.md) · [مخزن](https://github.com/ByKitsune/kitsune-router) · [تغییرات](../CHANGELOG.md) · [مهاجرت](../docs/MIGRATION.md)

## وضعیت انتشار و نصب

**نسخهٔ 1.0.0 پیشنهاد نخستین انتشار با تغییرات ناسازگارِ تغییر برند است؛ تأیید نهایی و انتشار هنوز انجام نشده‌اند.** ثبت/مالکیت نام‌ها، مجوز انتشار npm، دسترسی رجیستری و بسته‌ها باید تأیید شوند. مقصدها: `ByKitsune/kitsune-router`، بستهٔ `@bykitsune/router`، فرمان `kitsune-router` و ایمیج اصلی `ghcr.io/bykitsune/kitsune-router`. سوابق 0.x مربوط به بسته‌های اصلی ZenRouter هستند، نه انتشارهای قدیمی Kitsune.

نیازمند **Node.js >=22.19.0**. فقط پس از انتشار:

```bash
npm install -g @bykitsune/router@1.0.0
kitsune-router
# یا: npx @bykitsune/router@1.0.0
```

اجرای سورس از ریشهٔ مخزن است؛ زیرپوشهٔ `app/` وجود ندارد. اگر مخزن مقصد هنوز آماده نیست، از checkout موجود استفاده کنید:

فقط برای نصب **جدید**، secret را یک‌بار در `.env` خصوصی بسازید (POSIX shell/OpenSSL). `next dev` مولد launcher را اجرا نمی‌کند؛ بدون `JWT_SECRET` تصادفی با حداقل ۳۲ نویسه ورود شکست می‌خورد. در مهاجرت مقادیر مؤثر `JWT_SECRET`، `API_KEY_SECRET`، `MACHINE_ID_SALT` و `DATA_DIR` مطلق قبلی را حفظ کنید. فایل را بررسی و مقادیر نمونه را فقط در نصب جدید عوض کنید؛ `.env` را منتشر یا commit نکنید.

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

پیش از دسترسی عمومی، `INITIAL_PASSWORD` قوی تنظیم کنید. در `http://localhost:20128/dashboard` ارائه‌دهندهٔ مجاز را متصل و کلید درگاه را ایجاد/کپی کنید. نشانی پایهٔ کلاینت `http://localhost:20128/v1` است. مدل را از فهرست واقعی انتخاب کنید؛ `/api/health` دسترسی به upstream را ثابت نمی‌کند.

## اتصال ابزارها

فرمان اجرایی **`kitsune-router`** و شناسهٔ ارائه‌دهنده **`kitsunerouter`** است. Codex از `~/.codex/config.toml` استفاده می‌کند:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

ابتدا combo نمونهٔ `my-route` را بسازید. متغیر محیطی کلید صادرشده را نگه می‌دارد و کلید ایجاد نمی‌کند. Claude Code از `ANTHROPIC_BASE_URL=http://localhost:20128` استفاده و `/v1/messages` را اضافه می‌کند. تغییرات preset را بررسی و سایر تنظیمات را حفظ کنید. [نمونه‌های کامل](../docs/INTEGRATIONS.md).

## مهاجرت و امنیت

درگاه قدیمی و helperها را متوقف و از **تمام** پوشهٔ خصوصی داده پشتیبان بگیرید. راه‌اندازی می‌تواند `~/.zenrouter` یا `~/.9router` را به `~/.kitsune-router` منتقل کند (در ویندوز زیر `%APPDATA%`)، با snapshot سازگار SQLite و بررسی فایل‌های کپی‌شده. اصل داده باقی می‌ماند و مقصد موجود بازنویسی نمی‌شود. `DATA_DIR` صریح اولویت دارد و جابه‌جا نمی‌شود.

`db/data.sqlite`، `secrets.json`، `machine-id`، `auth/` و `mitm/` را حفظ کنید. salt رمزنگاری یا گواهی ریشهٔ مورد اعتماد را صرفاً برای تغییر نام عوض نکنید. رمزگذاری همهٔ اطلاعات ورود در حالت ذخیره تضمین نشده است. متغیرها `KITSUNE_ROUTER_*`، هدرها `x-kitsune-router-*` و شناسهٔ جدید `kitsunerouter` هستند. `/v1/*` و پورت 20128 ثابت می‌مانند؛ alias قدیمی فرمان/شناسه الزامی نیست.

Docker باید volume قبلی را در `/app/data` نگه دارد؛ انتشار فقط برای linux/amd64 است. ایمیج اصلی را بررسی کنید؛ mirror در Docker Hub اختیاری است. [نصب](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [عملیات](../docs/OPERATIONS.md).

صرفه‌جویی فشرده‌سازی به بار کاری بستگی دارد؛ درصد ثابت، سهمیهٔ نامحدود یا دسترس‌پذیری دائمی تضمین نمی‌شود. تخمین هزینه صورتحساب نیست و قیمت نامعلوم رایگان نیست. مجوز حساب، منطقه و شرایط ارائه‌دهنده پابرجاست. سرویس میزبانی‌شدهٔ پیش‌فرض Kitsune وجود ندارد و همگام‌سازی قدیمی حذف شده است. این ویرایش مستندات موفقیت تست/بیلد فعلی را تأیید نمی‌کند. [پیش‌نویس 1.0.0](../releases/RELEASE_NOTES_v1.0.0.md).

## قدردانی و مجوز

سپاس از نویسندگان و مشارکت‌کنندگان ZenRouter/9Router از جمله Joy و نیز [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)، [RTK](https://github.com/rtk-ai/rtk)، [Caveman](https://github.com/JuliusBrussee/caveman) و [Ponytail](https://github.com/DietrichGebert/ponytail). اعلان‌های کپی‌رایت و منشأ تاریخی حفظ می‌شوند. MIT: [LICENSE](../LICENSE).
