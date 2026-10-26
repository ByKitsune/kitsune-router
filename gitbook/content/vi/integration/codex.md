# Tích hợp Codex CLI

Lệnh `kitsune-router`, khóa provider **`kitsunerouter`**. Kết nối upstream hợp lệ và tạo/sao chép khóa gateway; không cấp thuê bao Codex/OpenAI hay mọi tính năng.

## Cấu hình

Gộp vào `~/.codex/config.toml`, không `config.json`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Tạo combo `my-route` trước hoặc thay ID model bật chính xác. Biến riêng chứa khóa gateway đã cấp, không tạo khóa. Preset có thể ghi header Authorization tĩnh: xem file là secret, giữ phần khác, không thay toàn bộ thư mục cấu hình.

Kiểm tra `/api/health`, `/v1/models` có auth rồi `codex --model my-route`. Remote dùng HTTPS `/v1` riêng, localhost không phải cloud. Catalog không chứng minh quyền, tốc độ hay billing; tài liệu/tham số không hỗ trợ có thể bị từ chối. [Tích hợp](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Tốc độ](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
