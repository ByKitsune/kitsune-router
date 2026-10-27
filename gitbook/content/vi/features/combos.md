# Combo và dự phòng

Combo là route có tên chứa các model bạn chọn, không tạo tài khoản/quyền/quota mới.

## Tạo route

1. Kết nối upstream được phép và xem model đang bật.
2. Tạo tên riêng, ví dụ `my-route`, trong Combos của dashboard.
3. Thêm ID chính xác, chọn thứ tự/chiến lược phiên bản hỗ trợ, kiểm tra khả năng và quyền mọi thành viên.
4. Lưu rồi dùng tên combo làm model client.

```json
{
  "model": "my-route",
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true
}
```

Đây là request, không phải schema nhập CSDL. Tạo combo trước; tránh chu kỳ và kiểm tra giới hạn thận trọng của combo lồng. Context lớn nhất hoặc tools không tự áp dụng cho mọi thành viên.

Không có vị trí bắt buộc cho nhà tài trợ/danh mục. Chi phí/giới hạn chưa rõ vẫn chưa rõ. Fallback hữu hạn, có thể phát sinh phí nhiều lần, không đảm bảo trần tiền hoặc liên tục. [Định tuyến](/vi/features/smart-routing/) · [Usage](/vi/features/quota-tracking/). [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) giữ combo; không xóa CSDL chỉ để đổi thương hiệu.
