# Cài đặt

**Nguồn 1.0.2 đã xác minh ở tag bất biến `65c8b97d`; xuất bản npm/GHCR bị chặn.** 9.041 qua, 100 skip, không lỗi assertion/suite; lint/build qua. npm publish bị E403 (2FA hoặc granular token bật bypass 2fa), readback HTTP 404; GHCR dừng trước build/push do preflight manifest thiếu. Thay token qua GitHub UI chưa xác nhận; chưa có image chính thức/GitHub Release. Gói `@bykitsune/router`, không tên lệnh bare; yêu cầu **Node.js >=22.19.0**. Dùng mã nguồn đến khi xuất bản/readback được xác minh. [Bằng chứng](/vi/changelog/).

## Launcher sau khi phát hành

```bash
npx @bykitsune/router@1.0.2
# Hoặc:
npm install -g @bykitsune/router@1.0.2
kitsune-router
```

Kiểm tra bằng `npm ls -g @bykitsune/router`; gỡ bằng `npm uninstall -g @bykitsune/router` mà không xóa dữ liệu. Không chạy lifecycle npm bằng sudo để sửa quyền tùy tiện.

Launcher có thể mặc định lắng nghe mọi giao diện. Thêm `--host 127.0.0.1` cho truy cập chỉ cục bộ; xem `kitsune-router --help`. Local-first không tự đảm bảo cô lập mạng.

## Từ mã nguồn

Chạy ở gốc kho chính thức đã xác nhận hoặc checkout hiện có, không thư mục `app/`.

Chỉ cài **mới**, tạo secret một lần trong `.env` riêng (POSIX shell/OpenSSL). `next dev` không dùng bộ sinh launcher: đăng nhập lỗi nếu thiếu `JWT_SECRET` ngẫu nhiên tối thiểu 32 ký tự. Nâng cấp giữ JWT/API/identity secret và `DATA_DIR` hiệu lực theo [di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Xem giá trị ví dụ khác chỉ cho cài mới; không công khai/commit `.env`.

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

Production: `npm run build` rồi `npm run start`. `DATA_DIR` phải tuyệt đối; đặt `INITIAL_PASSWORD` mạnh trước khi mở truy cập.

Mặc định `~/.kitsune-router` hoặc `%APPDATA%\kitsune-router` trên Windows. CSDL đang dùng là `db/data.sqlite`, không phải `db.json`; giữ secret, danh tính, auth và chứng chỉ. Dừng và sao lưu toàn bộ trạng thái cũ; `DATA_DIR` tường minh không bị chuyển. [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) · [Bắt đầu](/vi/getting-started/quick-start/). Tài liệu không xác nhận test/build hiện tại.
