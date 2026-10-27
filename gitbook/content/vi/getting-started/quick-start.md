# Bắt đầu nhanh

**Your models. Your routes.** Không bắt buộc ByKitsune hoặc thứ tự provider. **Nguồn 1.0.2 đã xác minh ở tag bất biến `65c8b97d`, xuất bản npm/GHCR bị chặn.** Dùng [mã nguồn](/vi/getting-started/installation/) và xem các blocker hiện tại. Lệnh dưới chỉ sau xuất bản/readback được xác minh, với Node.js >=22.19.0; tag/build local không chứng minh registry sẵn có.

```bash
npx @bykitsune/router@1.0.2
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
