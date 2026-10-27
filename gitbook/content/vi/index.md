# Chào mừng đến với Kitsune Router

**Your models. Your routes.** Gateway AI ưu tiên cục bộ, trung lập giữa nhà cung cấp, do [ByKitsune](https://bykitsune.com) duy trì/tài trợ. Bạn chọn mô hình, tài khoản và thứ tự dự phòng; không bắt buộc tài khoản ByKitsune hay mua API hosted. Yêu cầu vẫn gửi tới upstream đã cấu hình, không phải suy luận offline.

## Trạng thái phát hành

**1.0.1 là ứng viên tiếp theo đã chọn, chờ tag/SHA cuối và phát hành.** Kho GitHub đã xác nhận; npm xác thực là `bykitsune` và Actions cập nhật credential, nhưng quyền xuất bản, registry và hiện vật chưa được chứng minh.

| Thành phần | Định danh |
| --- | --- |
| Kho mã | [ByKitsune/kitsune-router](https://github.com/ByKitsune/kitsune-router) |
| npm | `@bykitsune/router` |
| Lệnh | `kitsune-router` |
| Khóa provider của công cụ | `kitsunerouter` |
| Image chuẩn | `ghcr.io/bykitsune/kitsune-router` |

`v1.0.0` giữ nguyên tại `390a65677c06a30084386d2a2adf8b0c48709281`: workflow lỗi ownership non-root, không xuất bản npm/GHCR 1.0.0. 9.029 test cũ không xác minh 1.0.1. Bản tiếp theo cô lập inventory tiến trình tổng hợp trong test và sửa wrap key mobile; production vẫn fail-closed. [Thay đổi](/vi/changelog/) · [Bản nháp 1.0.1](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md). Giữ lịch sử 0.x.

## Khả năng và giới hạn

Chuyển đổi giao thức theo giới hạn từng route, combo/tài khoản tùy chọn, SQLite cục bộ và nén tùy chọn. Không đảm bảo hạn mức vô tận, tỷ lệ tiết kiệm cố định hoặc hoạt động liên tục. Ước tính không phải hóa đơn; chưa rõ không phải miễn phí. Đồng bộ cũ đã bỏ; truy cập từ xa là dịch vụ HTTPS có xác thực do bạn quản lý.

[Bắt đầu](/vi/getting-started/quick-start/) · [Cài đặt](/vi/getting-started/installation/) · [Tích hợp](/vi/integration/other-tools/) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Giữ giấy phép MIT, thông báo bản quyền và công lao ZenRouter/9Router: [LICENSE](https://github.com/ByKitsune/kitsune-router/blob/master/LICENSE).
