# Tích hợp Cursor

Dùng thiết lập OpenAI-compatible tùy chỉnh của phiên bản Cursor bạn cài. Không cấp thuê bao hoặc mọi tính năng hosted.

Chạy gateway, nối provider được phép, tạo khóa và chọn model/combo từ `/v1/models`.

```text
Base URL: http://localhost:20128/v1
API key: khóa gateway đã cấp
Model: ID đang bật chính xác hoặc combo đã tạo
```

Xem lại preset, giữ thiết lập khác. Provider `kitsunerouter`, executable `kitsune-router`; nhãn UI thay đổi theo phiên bản.

Tính năng chạy trên máy chủ editor không truy cập localhost máy bạn. Remote cần HTTPS có auth riêng, không mở dashboard không bảo vệ. Tools, vision, structured output và documents tùy route/client. [Công cụ khác](/vi/integration/other-tools/) · [Khắc phục](/vi/troubleshooting/).
