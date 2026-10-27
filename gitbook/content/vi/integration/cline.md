# Tích hợp Cline

Chọn chế độ OpenAI Compatible của Cline hiện tại; đăng nhập native có thể bỏ qua gateway. Chạy gateway, nối upstream hợp lệ, tạo/sao chép khóa và chọn route bật trước.

```text
Base URL: http://localhost:20128/v1
API key: khóa gateway đã cấp
Model ID: model bật hoặc combo đã cấu hình
```

Xem preset, giữ editor settings và bảo vệ secret. Provider `kitsunerouter`, lệnh `kitsune-router`.

Thử request nhỏ rồi tools/vision cần dùng. Catalog không đảm bảo quyền hay mọi tham số chuyển đổi. Nén không hứa tỷ lệ tiết kiệm. Tôn trọng retry 429/503; remote dùng HTTPS có auth riêng, không cần tài khoản ByKitsune. [Tham khảo](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) · [Khắc phục](/vi/troubleshooting/).
