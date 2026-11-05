# Cài đặt

**1.0.8 đã xuất bản trên npm, GitHub Release và GHCR chính thức.** [Bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) lưu kết quả đọc xác minh và giới hạn của từng kênh. Truy cập GHCR ẩn danh được kiểm tra riêng: yêu cầu cấp quyền ẩn danh quan sát được trả HTTP 401; chỉ kết quả này không xác định tính công khai của gói.

**Lịch sử 1.0.7:** npm, GHCR và GitHub Release đã xuất bản từ `b7f77d07`; các lần cài SQLite và khay hệ thống tuần tự bằng `--no-save` có thể xóa phụ thuộc của nhau. Mã nguồn 1.0.8 sửa việc giữ các pin này. [Bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) giữ lại vấn đề đã quan sát và trạng thái của từng bản phân phối.

**Mục tiêu hiện tại: 1.0.8.** Các lệnh launcher cần **Node.js >=22.19.0** và kết quả xác nhận xuất bản/đọc lại npm 1.0.8. Kiểm tra [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) trước khi cài; kết quả GitHub Release, npm và GHCR độc lập với nhau. Bạn vẫn có thể cài từ mã nguồn.

**Ghi chép lịch sử của 1.0.2; không xác định trạng thái của 1.0.6:** **Nguồn 1.0.2 đã xác minh; container xuất bản private; npm bị chặn.** Runtime giữ `65c8b97d`. Recovery `40485038668` xuất bản GHCR, readback xác thực digest/provenance/SPDX và smoke image đã xuất bản qua. Gói vẫn **private**, chọn Public chưa xác nhận, grant ẩn danh HTTP 401. Dùng nguồn hoặc [truy cập container private được phép](/vi/deployment/cloud/). npm `@bykitsune/router` vẫn E403/readback công khai HTTP 404, thay token chưa xác nhận. Các lệnh của 1.0.2 yêu cầu xuất bản/readback **npm** thành công và **Node.js >=22.19.0**. [Bằng chứng](/vi/changelog/).

## Launcher sau khi phát hành

```bash
npx @bykitsune/router@1.0.8
# Hoặc:
npm install -g @bykitsune/router@1.0.8
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
