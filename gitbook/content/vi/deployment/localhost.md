# Triển khai localhost

**1.0.8 đang được chuẩn bị, chưa xuất bản.** Cần hoàn tất CI cho SHA chính xác và phép thử cài đặt bình thường của bản ứng viên trước khi tạo tag hoặc xuất bản.

**Lưu ý về 1.0.7:** GitHub Release, npm và Docker đã được xuất bản từ `b7f77d07`, nhưng các lần cài SQLite và khay hệ thống tuần tự bằng `--no-save` có thể xóa phụ thuộc của nhau. Xem kết quả và giới hạn quan sát trong [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).

Dashboard/API dùng chung cổng **20128**, không phải 3000. Mục tiêu hiện tại là **1.0.8**. Chỉ dùng launcher sau khi [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) xác nhận npm 1.0.8, hoặc [cài từ mã nguồn](/vi/getting-started/installation/) với Node.js >=22.19.0. Quyền dùng [container](/vi/deployment/cloud/) phụ thuộc vào kết quả xuất bản và khả năng truy cập đã được xác minh riêng.

**Ghi chép lịch sử của 1.0.2; không xác định trạng thái của 1.0.6:** Dashboard/API cùng cổng **20128**, không 3000. Runtime 1.0.2 giữ `65c8b97d`; container đã **xuất bản private**, truy cập ẩn danh chờ xác nhận, npm bị chặn. Dùng [mã nguồn](/vi/getting-started/installation/) với Node.js >=22.19.0 hoặc [container private được phép](/vi/deployment/cloud/). Lệnh launcher của 1.0.2 yêu cầu xuất bản/readback npm thành công.

- Dashboard: `http://localhost:20128/dashboard`
- API: `http://localhost:20128/v1`
- Health: `http://localhost:20128/api/health`
- Dữ liệu: `~/.kitsune-router` hoặc `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

`DATA_DIR` tường minh có ưu tiên, không di chuyển. Dừng bằng launcher hoặc `Ctrl+C`, không writer đồng thời/kill diện rộng. Backup toàn thư mục đã dừng: SQLite, secret, identity, auth, chứng chỉ. Không khôi phục đè lên trạng thái đang chạy hoặc mở quyền rộng.

Di chuyển kiểm tra/copy `~/.zenrouter`/`~/.9router` đã dừng, giữ bản gốc, không ghi đè đích. [Hướng dẫn](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Giữ salt và root tin cậy, đặt mật khẩu mạnh. Với nguồn dùng đường dẫn tuyệt đối và [vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)/`.env.example`, không chỉ dẫn Node 20/`db.json` cũ.
