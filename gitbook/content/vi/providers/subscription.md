# Nhà cung cấp thuê bao và OAuth

Kitsune Router kết nối sản phẩm OAuth/thuê bao hỗ trợ cùng API-key và dịch vụ local. Đây là loại kết nối/thanh toán, không phải tier đầu bắt buộc.

1. Trong Providers ở `http://localhost:20128/dashboard`, chọn đúng sản phẩm hỗ trợ như Codex, Claude Code, Gemini CLI hoặc Copilot.
2. Theo OAuth/device flow và kiểm tra trạng thái/model tài khoản.
3. Cấp quyền lại nếu upstream thu hồi token; không xóa toàn gateway.
4. Client dùng khóa gateway, không refresh token; sắp combo theo ý bạn.

API công khai, coding plan và quyền IDE không thay thế nhau. Không cam kết giá/quota tháng cố định hay quyền mọi model; kiểm tra điều khoản, khu vực, tự động hóa cho phép. Định tuyến không tạo quyền hoặc lách giới hạn.

Quota chưa rõ giữ chưa rõ; tốc độ premium có thể tốn thêm. Giá API USD không phải hóa đơn thuê bao. [Usage](/vi/features/quota-tracking/). Không cần ByKitsune, không ưu tiên tài trợ. [API-key](/vi/providers/cheap/) · [Miễn phí/local](/vi/providers/free/).

Giữ secret OAuth khi [di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md); không đảm bảo mọi credential mã hóa khi lưu.
