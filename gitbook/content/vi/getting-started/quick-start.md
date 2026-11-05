# Bắt đầu nhanh

**1.0.8 đang được chuẩn bị, chưa xuất bản.** Cần hoàn tất CI cho SHA chính xác và phép thử cài đặt bình thường của bản ứng viên trước khi tạo tag hoặc xuất bản.

**Lưu ý về 1.0.7:** GitHub Release, npm và Docker đã được xuất bản từ `b7f77d07`, nhưng các lần cài SQLite và khay hệ thống tuần tự bằng `--no-save` có thể xóa phụ thuộc của nhau. Xem kết quả và giới hạn quan sát trong [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).

**Your models. Your routes.** Không bắt buộc tài khoản ByKitsune hay thứ tự provider. Mục tiêu hiện tại là **1.0.8**; launcher cần **Node.js >=22.19.0**. Chỉ dùng lệnh bên dưới sau khi [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) xác nhận npm 1.0.8 đã xuất bản và đọc lại được. Trong lúc chờ, dùng [mã nguồn](/vi/getting-started/installation/); khả năng dùng [container](/vi/deployment/cloud/) được xác minh riêng.

**Ghi chép lịch sử của 1.0.2; không xác định trạng thái của 1.0.6:** **Container 1.0.2 đã xuất bản private, pull ẩn danh còn chờ, npm bị chặn.** Runtime giữ `65c8b97d`. Dùng [mã nguồn](/vi/getting-started/installation/) hoặc [truy cập container private được phép](/vi/deployment/cloud/). Các lệnh của 1.0.2 yêu cầu xuất bản/readback **npm** thành công, với Node.js >=22.19.0; xuất bản container không đồng nghĩa với xuất bản launcher npm.

```bash
npx @bykitsune/router@1.0.8
```

## Thiết lập

1. Đặt `INITIAL_PASSWORD` mạnh trong môi trường riêng, mở `http://localhost:20128/dashboard`.
2. Kết nối upstream được phép qua OAuth/API key. Gateway không cấp gói thuê bao hay quota vô hạn.
3. Tạo/sao chép khóa gateway và giữ trong biến client `KITSUNE_ROUTER_API_KEY`. Biến không tự tạo khóa.
4. Chọn model thật sự có trong danh mục hoặc tạo combo ví dụ `my-route`.

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Health chỉ kiểm tra gateway/lưu trữ, không xác nhận quyền upstream. Base OpenAI-compatible `http://localhost:20128/v1`. Khóa provider **`kitsunerouter`**, lệnh **`kitsune-router`**. Xem [Codex](/vi/integration/codex/) và [Claude Code](/vi/integration/claude-code/).

Trước nâng cấp, dừng gateway/helper cũ, sao lưu cả thư mục riêng và đọc [di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Không thay volume bằng bản trống hoặc đổi salt/chứng chỉ chỉ vì tên mới.
