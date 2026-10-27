# Tích hợp Roo

Dùng OpenAI-compatible được bản Roo hỗ trợ. Gateway định tuyến/chuyển đổi, không cấp thuê bao hay đảm bảo mọi chức năng.

```text
Base URL: http://localhost:20128/v1
API key: khóa Kitsune Router gateway đã cấp
Model: ID bật chính xác hoặc combo đã tạo
```

Nối upstream được phép và tạo key trước. `my-route` chỉ có sau khi tạo combo. Xem `/v1/models` có xác thực.

Giữ cấu hình khác, xem preset. Provider **`kitsunerouter`**, lệnh **`kitsune-router`**; không đưa secret OAuth vào ví dụ/issue.

`/api/health` không chứng minh inference. Kiểm tra tools/media, tôn trọng retry/cancel. Remote cần HTTPS có auth do bạn quản lý, không cloud Kitsune mặc định. [Công cụ khác](/vi/integration/other-tools/) · [Khắc phục](/vi/troubleshooting/) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
