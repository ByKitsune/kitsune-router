# Kitsune Router

**Your models. Your routes.**

Gateway AI ưu tiên cục bộ, trung lập giữa các nhà cung cấp, do [ByKitsune](https://bykitsune.com) duy trì và tài trợ. Bạn chọn mô hình, tài khoản và thứ tự dự phòng. Không bắt buộc tài khoản ByKitsune hay mua API lưu trữ sẵn. Yêu cầu vẫn được gửi tới upstream đã cấu hình; local-first không có nghĩa là suy luận ngoại tuyến.

[English](../README.md) · [Kho mã](https://github.com/ByKitsune/kitsune-router) · [Thay đổi](../CHANGELOG.md) · [Di chuyển](../docs/MIGRATION.md)

## Phát hành và cài đặt

**1.0.1 là ứng viên tiếp theo đã chọn; chờ xác minh tag/SHA cuối và phát hành.** Kho `ByKitsune/kitsune-router` đã xác nhận; gói `@bykitsune/router`, lệnh `kitsune-router`, image `ghcr.io/bykitsune/kitsune-router`. npm đã xác thực là `bykitsune` và cập nhật credential Actions, nhưng chưa chứng minh quyền xuất bản hay hiện vật sẵn có.

Tag `v1.0.0` giữ nguyên ở `390a65677c06a30084386d2a2adf8b0c48709281`, không npm/GHCR sau lỗi workflow non-root. 1.0.1 cô lập tiến trình tổng hợp trong regression/denial test và wrap key mobile; production vẫn fail-closed khi ownership same-UID không đọc được. 9.029 test cũ không xác minh bản mới. [Lần thử](../releases/RELEASE_NOTES_v1.0.0.md) · [Ứng viên 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md). Giữ nguồn gốc 0.x.

Yêu cầu **Node.js >=22.19.0**. Chỉ dùng sau khi phát hành:

```bash
npm install -g @bykitsune/router@1.0.1
kitsune-router
# Hoặc: npx @bykitsune/router@1.0.1
```

Chạy từ kho chính thức đã xác nhận hoặc checkout hiện có, ở gốc không có thư mục con `app/`:

Chỉ với bản cài **mới**, tạo secret một lần trong `.env` riêng (shell POSIX/OpenSSL). `next dev` không chạy bộ sinh secret của launcher; thiếu `JWT_SECRET` ngẫu nhiên tối thiểu 32 ký tự thì đăng nhập lỗi. Khi di chuyển giữ giá trị hiệu lực `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` và `DATA_DIR` tuyệt đối. Xem lại file, thay giá trị ví dụ chỉ cho cài mới; không công khai/commit `.env`.

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

Đặt `INITIAL_PASSWORD` mạnh trước khi mở truy cập. Vào `http://localhost:20128/dashboard`, kết nối nhà cung cấp được phép, tạo/sao chép khóa gateway. Base URL: `http://localhost:20128/v1`. Chọn mô hình thực sự có trong danh mục; `/api/health` không chứng minh quyền truy cập upstream.

## Tích hợp

Lệnh là **`kitsune-router`**, khóa nhà cung cấp là **`kitsunerouter`**. Codex dùng `~/.codex/config.toml`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Tạo combo ví dụ `my-route` trước. Biến môi trường chứa khóa gateway đã cấp, không tự tạo khóa. Claude Code dùng `ANTHROPIC_BASE_URL=http://localhost:20128` và tự thêm `/v1/messages`. Xem lại preset, giữ nguyên thiết lập khác. [Ví dụ đầy đủ](../docs/INTEGRATIONS.md).

## Di chuyển và an toàn

Dừng gateway cũ cùng helper, sao lưu **toàn bộ** thư mục riêng tư. Khởi động có thể chuyển `~/.zenrouter` hoặc `~/.9router` sang `~/.kitsune-router` (tương ứng dưới `%APPDATA%` trên Windows), kiểm tra snapshot SQLite nhất quán và file đã sao chép. Giữ bản gốc, không ghi đè đích đã tồn tại. `DATA_DIR` được đặt rõ ràng luôn ưu tiên và không bị di chuyển.

Giữ `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/`, `mitm/`. Không đổi salt mã hóa hoặc chứng chỉ gốc đã tin cậy chỉ để đổi tên. Không đảm bảo mọi khóa nhà cung cấp đều mã hóa khi lưu. Biến mới: `KITSUNE_ROUTER_*`; header: `x-kitsune-router-*`; provider: `kitsunerouter`. `/v1/*` và cổng 20128 không đổi; không bắt buộc alias lệnh/provider cũ.

Docker giữ volume/mount ở `DATA_DIR` hiệu lực: mặc định `/app/data` hoặc path tuyệt đối tùy chỉnh hỗ trợ; chỉ linux/amd64. Linux hạn chế cần dừng/backup rồi dùng `DATA_DIR` rõ ràng giữ nguồn không di chuyển hoặc nhờ review đặc quyền; không bỏ qua permission. Kiểm tra image, mirror tùy chọn. [Cài đặt](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Vận hành](../docs/OPERATIONS.md).

Tiết kiệm nén tùy khối lượng công việc; không cam kết tỷ lệ cố định, hạn mức vô tận hay hoạt động liên tục. Chi phí ước tính không phải hóa đơn; chưa rõ không có nghĩa miễn phí. Quyền tài khoản, khu vực và điều khoản upstream vẫn áp dụng. Không có dịch vụ Kitsune hosted mặc định; đồng bộ đám mây cũ đã bị gỡ. Lần sửa tài liệu này không xác nhận test/build hiện tại. [Bản nháp 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md).

## Ghi nhận và giấy phép

Cảm ơn tác giả/cộng tác viên ZenRouter/9Router, gồm Joy, cùng [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman), [Ponytail](https://github.com/DietrichGebert/ponytail). Giữ nguyên thông báo bản quyền và nguồn gốc lịch sử. MIT: [LICENSE](../LICENSE).
