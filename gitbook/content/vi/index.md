# Chào mừng đến với Kitsune Router

**Your models. Your routes.** Gateway AI ưu tiên cục bộ, trung lập giữa nhà cung cấp, do [ByKitsune](https://bykitsune.com) duy trì/tài trợ. Bạn chọn mô hình, tài khoản và thứ tự dự phòng; không bắt buộc tài khoản ByKitsune hay mua API hosted. Yêu cầu vẫn gửi tới upstream đã cấu hình, không phải suy luận offline.

## Nhà cung cấp ByKitsune chính thức

ByKitsune được làm nổi bật là nhà cung cấp chính thức ở đầu danh sách. Trong **Providers**, chọn **Connect ByKitsune**, thêm khóa từ [trang khóa ByKitsune](https://bykitsune.com/dashboard?tab=keys), rồi chọn **Fetch Models**. API dùng `https://api.bykitsune.com/v1` với xác thực Bearer; dùng các route `bykitsune/<model-id>` được trả về. Bạn vẫn chọn tài khoản và thứ tự định tuyến.

Tích hợp này thuộc mã nguồn hiện tại.

## Trạng thái phát hành

**Container 1.0.2 đã xuất bản private; pull ẩn danh chờ xác nhận; npm bị chặn.** Runtime cố định `65c8b97d` (9.041 qua, 100 skip, không lỗi). Recovery `40485038668` xuất bản GHCR `1.0.2`/`latest`, readback xác thực digest/provenance/SPDX và smoke độc lập image đã xuất bản qua. Gói vẫn **private** ở lần đọc cuối: chủ chọn Public nhưng chưa xác nhận, grant ẩn danh HTTP 401. npm vẫn E403/readback công khai HTTP 404, thay token chưa xác nhận. Dùng nguồn hoặc quyền container private được phép; lệnh npm chỉ sau xuất bản npm được chấp nhận. Không GitHub Release/production. [Bằng chứng](/vi/changelog/).

| Thành phần | Định danh |
| --- | --- |
| Kho mã | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Lệnh | `kitsune-router` |
| Khóa provider của công cụ | `kitsunerouter` |
| Image chuẩn | `ghcr.io/bykitsune/kitsune-router` |

Giữ tag bất biến: `v1.0.1` tại `74583402` qua SSH/CI, nhưng GHCR lỗi trước login/push nên không có image chính thức; npm publish lỗi, chưa rõ nguyên nhân, readback công khai HTTP 404 ngày 2026-10-27 và không GitHub Release. `v1.0.0` tại `390a6567` không có npm/GHCR sau lỗi test di chuyển. 1.0.2 kiểm soát thời gian test và cải thiện chẩn đoán npm, không đổi thứ tự hoặc ownership fail-closed production. Số cũ không xác minh bản mới. [Thay đổi](/vi/changelog/) · [Bản nháp 1.0.2](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md). Giữ lịch sử 0.x.

## Khả năng và giới hạn

Chuyển đổi giao thức theo giới hạn từng route, combo/tài khoản tùy chọn, SQLite cục bộ và nén tùy chọn. Không đảm bảo hạn mức vô tận, tỷ lệ tiết kiệm cố định hoặc hoạt động liên tục. Ước tính không phải hóa đơn; chưa rõ không phải miễn phí. Đồng bộ cũ đã bỏ; truy cập từ xa là dịch vụ HTTPS có xác thực do bạn quản lý.

[Bắt đầu](/vi/getting-started/quick-start/) · [Cài đặt](/vi/getting-started/installation/) · [Tích hợp](/vi/integration/other-tools/) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Giữ giấy phép MIT, thông báo bản quyền và công lao ZenRouter/9Router: [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE).
