# Bắt đầu nhanh

**Your models. Your routes.** Không bắt buộc ByKitsune hoặc thứ tự provider. 1.0.1 chờ tag/SHA cuối và phát hành; v1.0.0 là lần thử không có npm/GHCR. Dùng [nguồn](/vi/getting-started/installation/) trước. Chỉ sau xuất bản, với Node.js >=22.19.0:

```bash
npx @bykitsune/router@1.0.1
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
