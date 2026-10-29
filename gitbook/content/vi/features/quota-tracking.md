# Quota và usage

Kitsune Router lưu usage cục bộ, hiển thị quota/reset nếu upstream hỗ trợ. Ước tính usage, hạn mức và hóa đơn là ba khái niệm khác nhau.

## Hiểu dữ liệu

- Dùng bộ đếm thật input/output/cache theo route; thiếu dữ liệu không thành số không giả.
- Quota có thể theo tài khoản, model, dịch vụ, cửa sổ. Probe lỗi không chứng minh quota mới hoặc tài khoản vô hiệu.
- **Chưa rõ giá không phải miễn phí.** Tổng phụ đã biết và số request chưa định giá không phải tổng đầy đủ.
- Tốc độ thực nhận có thể khác yêu cầu; credit thuê bao không thành hóa đơn API USD. [Tốc độ](https://github.com/ByKitsune/kitsune-router/blob/master/docs/PROCESSING-SPEED.md).
- Retry có thể tính usage; client hủy không chứng minh upstream ngừng tính tiền. Giới hạn token không phải ngân sách tiền.

## Làm mới dashboard

Trong thay đổi mã nguồn ngày 29-10-2026, một cập nhật usage đã ghi nhận sẽ lên lịch tải lại thống kê và biểu đồ của kỳ đang chọn; việc kết nối hoặc kết nối lại cũng kích hoạt tải lại. Với server cũ, thay đổi trong tổng hoặc bảng phân tích là tín hiệu tải lại, nhưng snapshot toàn thời gian không thay thế số liệu của kỳ đang chọn. Tải lại tab đã mở trước khi nâng cấp để dùng client mới.

Nếu tải lại thất bại, dashboard giữ dữ liệu thành công gần nhất và ghi rõ kỳ tương ứng; dùng nút thử lại và đăng nhập lại nếu được yêu cầu. Thời gian trôi qua không tự kích hoạt cập nhật: hãy đổi kỳ hoặc tải lại trang. Stream cũ cũng không phát hiện được thay đổi nếu mọi tổng và bảng phân tích được so sánh đều giữ nguyên. Nguyên nhân gốc của sự cố dashboard trên production chưa được xác nhận.

## Phạm vi giá

Tham chiếu models.dev giữ đúng sản phẩm/nhà cung cấp và ID nguyên gốc của model. Chỉ giá token văn bản trả theo mức sử dụng tương thích mới được dùng để ước tính; gói đăng ký, đơn vị media hoặc giá có điều kiện không tự trở thành giá token. Bộ lập lịch thử tải và xác minh toàn bộ catalog mỗi sáu giờ. Mỗi quan sát chỉ áp dụng từ thời điểm quan sát thực tế đến trước 24 giờ sau đó, theo thời gian đã ghi của request. Lỗi tải và HTTP 304 không gia hạn quan sát; `MODEL_CATALOG_SYNC=off` tắt cập nhật qua mạng nhưng vẫn cho đọc quan sát đã lưu. Chi phí lịch sử không bị tính lại; thành phần chưa có giá vẫn là chưa rõ và giá tham chiếu không phải hóa đơn. Xem [bản kiểm tra toàn bộ registry hiện tại](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/22-pricing-capability-localization-2026-10.md).

Sổ usage chưa lưu `usage.cost` và các trường hạn mức Go do OpenCode báo. Hãy xem dashboard của nhà cung cấp để biết các giá trị đó; hạn mức không phải khoản tiền đã thu.

## Lưu trữ và giám sát

Cấu hình/usage dùng chung `${DATA_DIR}/db/data.sqlite`; `usage.json`/`db.json` chỉ là nguồn di chuyển cũ. Dùng đường dẫn tuyệt đối, sao lưu toàn thư mục đã dừng gồm secret/auth/chứng chỉ. [Vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Kiểm tra `/api/metrics` có xác thực của bản cài trước khi viết cảnh báo; không dùng `rate()`/`increase()` lên snapshot cửa sổ trượt. `/api/health` không chứng minh quyền upstream; số test cũ không xác nhận bản mới. Nén không hứa tỷ lệ tiết kiệm, hóa đơn chính thức là nguồn chi phí thật.
