# API-key và lựa chọn chi phí

Danh mục cũ “giá rẻ” là nhóm tài liệu, không là ưu tiên hay cam kết giá. Chọn theo workload, khả năng và hợp đồng hiện tại.

1. Lấy key qua luồng chính thức, kiểm tra điều khoản/khu vực.
2. Thêm provider/node hỗ trợ với endpoint, namespace đúng.
3. Xem model/giới hạn thật. API công khai, reseller, coding plan không tự dùng cùng ID/giá.
4. Tạo khóa gateway cho client và đưa route vào combo theo thứ tự bạn chọn.

Không đưa secret vào issue/config công khai. Dùng `DATA_DIR` tuyệt đối riêng tư, backup đầy đủ; lưu local không có nghĩa mọi key mã hóa khi lưu.

## Nhà cung cấp ByKitsune chính thức

ByKitsune được làm nổi bật là nhà cung cấp chính thức ở đầu danh sách. Trong **Providers**, chọn **Connect ByKitsune**, thêm khóa từ [trang khóa ByKitsune](https://bykitsune.com/dashboard?tab=keys), rồi chọn **Fetch Models**. API dùng `https://api.bykitsune.com/v1` với xác thực Bearer; dùng các route `bykitsune/<model-id>` được trả về. Bạn vẫn chọn tài khoản và thứ tự định tuyến.

Tích hợp này thuộc mã nguồn hiện tại.

## Giá thực tế

Ngày, endpoint, context, cache, media và tier thực nhận ảnh hưởng giá. Bảng cũ “$0.20/1M” không chứng minh hóa đơn hôm nay. Dùng billing chính thức và metadata/override đã kiểm tra; chưa rõ không thành không.

Nén/fallback thay đổi chi phí, có thể tính phí thêm lần thử; không có tỷ lệ cố định hay trần tiền bảo đảm. ByKitsune duy trì/tài trợ, không là dịch vụ bắt mua. [Usage](/vi/features/quota-tracking/) · [Combo](/vi/features/combos/) · [Cài đặt](/vi/getting-started/installation/).
