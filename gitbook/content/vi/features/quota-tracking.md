# Quota và usage

Kitsune Router lưu usage cục bộ, hiển thị quota/reset nếu upstream hỗ trợ. Ước tính usage, hạn mức và hóa đơn là ba khái niệm khác nhau.

## Hiểu dữ liệu

- Dùng bộ đếm thật input/output/cache theo route; thiếu dữ liệu không thành số không giả.
- Quota có thể theo tài khoản, model, dịch vụ, cửa sổ. Probe lỗi không chứng minh quota mới hoặc tài khoản vô hiệu.
- **Chưa rõ giá không phải miễn phí.** Tổng phụ đã biết và số request chưa định giá không phải tổng đầy đủ.
- Tốc độ thực nhận có thể khác yêu cầu; credit thuê bao không thành hóa đơn API USD. [Tốc độ](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md).
- Retry có thể tính usage; client hủy không chứng minh upstream ngừng tính tiền. Giới hạn token không phải ngân sách tiền.

## Lưu trữ và giám sát

Cấu hình/usage dùng chung `${DATA_DIR}/db/data.sqlite`; `usage.json`/`db.json` chỉ là nguồn di chuyển cũ. Dùng đường dẫn tuyệt đối, sao lưu toàn thư mục đã dừng gồm secret/auth/chứng chỉ. [Vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Kiểm tra `/api/metrics` có xác thực của bản cài trước khi viết cảnh báo; không dùng `rate()`/`increase()` lên snapshot cửa sổ trượt. `/api/health` không chứng minh quyền upstream; số test cũ không xác nhận bản mới. Nén không hứa tỷ lệ tiết kiệm, hóa đơn chính thức là nguồn chi phí thật.
