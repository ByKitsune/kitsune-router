# Tích hợp Continue

Schema Continue thay đổi theo phiên bản. Dùng thiết lập OpenAI-compatible hiện tại, không ghi đè toàn cấu hình bằng JSON/YAML cũ.

```text
API base: http://localhost:20128/v1
API key: khóa gateway đã cấp
Model: ID bật chính xác hoặc combo đã tạo
```

Nối upstream hợp lệ, tạo key, xem `/v1/models`. Cấu hình từng vai trò riêng: chat không tự cung cấp embeddings hay autocomplete.

Provider **`kitsunerouter`**, lệnh **`kitsune-router`**. Xem preset và giữ provider/context/editor khác; không commit key.

Health `/api/health` không xác nhận quyền/tools/media. Thử giao thức cần dùng, tránh nhân retry trả phí ở client và gateway. Remote là HTTPS `/v1` của bạn, không bắt buộc ByKitsune. [Tích hợp](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Khắc phục](/vi/troubleshooting/).
