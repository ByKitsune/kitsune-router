# Định tuyến thông minh

Kitsune Router dùng mô hình/tài khoản **do bạn cấu hình**, không ép thứ tự thuê bao → rẻ → miễn phí, không ưu tiên ByKitsune hoặc yêu cầu tài khoản của họ.

## Chọn route và dự phòng

Yêu cầu model trực tiếp chọn route đó. Combo mở rộng thành viên/chiến lược đã lưu, rồi chọn tài khoản của provider tương ứng. Model trực tiếp không tự có chuỗi fallback toàn cục chưa cấu hình.

```text
Yêu cầu my-route
  → thành viên A đã cấu hình → tài khoản phù hợp
  → retry/fallback được phép
  → thành viên B hoặc lỗi kết thúc rõ ràng
```

Tạo `my-route` trước. Sắp mô hình được bật theo khả năng, riêng tư, độ trễ hay chi phí. Nhãn danh mục không quyết định thứ tự. [Combo](/vi/features/combos/).

Quota chưa rõ không phải vô hạn. Hủy/lỗi yêu cầu không nên làm cạn pool tài khoản; fallback không âm thầm tăng output trả phí hay bỏ tài liệu/tham số. Output một phần và usage thật không phải lần thử miễn phí. Tôn trọng quota, khu vực và điều khoản; mọi thành viên có thể cùng lỗi.

[Usage](/vi/features/quota-tracking/) · [Kiến trúc](https://github.com/ByKitsune/kitsune-router/blob/master/docs/ARCHITECTURE.md). Không cam kết không gián đoạn, tiết kiệm cố định hoặc trần tiền tuyệt đối.
