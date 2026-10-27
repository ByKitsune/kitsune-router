# Tích hợp Claude Code

Chạy gateway, kết nối upstream được phép, tạo/sao chép khóa gateway và chọn route Messages. `my-route` là combo phải tự tạo. Không cần tài khoản ByKitsune.

## Biến client

Claude Code thêm `/v1/messages`, dùng origin **không có `/v1`**:

```bash
export ANTHROPIC_BASE_URL="http://localhost:20128"
export ANTHROPIC_AUTH_TOKEN="$KITSUNE_ROUTER_API_KEY"
claude --model my-route
```

Biến chứa khóa gateway đã cấp, không refresh token upstream và không tạo key. Thử trong phiên hiện tại, giữ cấu hình có sẵn.

Preset ghi `env` trong `~/.claude/settings.json`, không các trường tự đặt `baseUrl`/`defaultModel`. Xem lại và backup. Claude Desktop là sản phẩm khác; đây không là công thức cấu hình desktop chung.

`/api/health` và `/v1/models` có auth không chứng minh tools/media/document/quyền tài khoản. Remote dùng origin HTTPS riêng không `/v1`, không dịch vụ Kitsune hosted mặc định. [Tham khảo](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
