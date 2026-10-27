# Câu hỏi thường gặp

## Kitsune Router là gì?

Gateway trung lập, local-first do [ByKitsune](https://bykitsune.com) duy trì/tài trợ, tiếp nối ZenRouter/9Router. **Your models. Your routes.** Gửi tới upstream bạn cấu hình, không tự tới nhà tài trợ.

## 1.0.2 đã phát hành?

**Nguồn đã xác minh, xuất bản bị chặn.** `v1.0.2` / `65c8b97d` qua 9.041 test, 100 skip, không lỗi assertion/suite, lint/build qua. npm publish bị E403 (2FA hoặc granular token bật bypass 2fa), readback công khai HTTP 404. Người dùng sẽ thay token qua GitHub UI nhưng chưa xác nhận xong. GHCR qua gate/login rồi dừng ở preflight trước build/push; chưa có image chính thức/GitHub Release. Recovery riêng không đổi tag/phiên bản; nguyên nhân npm 1.0.1 vẫn chưa rõ. [Cài đặt](/vi/getting-started/installation/) · [Thay đổi](/vi/changelog/). Giữ lịch sử 0.x.

## Bắt buộc tài khoản/thứ tự?

Không cần ByKitsune. Chọn account/combo riêng; quyền, thuê bao, vùng và điều khoản upstream vẫn áp dụng.

## Miễn phí/vô hạn?

MIT là giấy phép phần mềm, không loại bỏ chi phí upstream/hardware/quota. Nén không hứa tỷ lệ; ước tính không phải hóa đơn, chưa rõ không thành không.

## Định danh nào đổi?

Gói `@bykitsune/router`, lệnh `kitsune-router`, provider `kitsunerouter`, biến `KITSUNE_ROUTER_*`, header `x-kitsune-router-*`. `/v1/*`, `/v1beta/*`, 20128 giữ nguyên; không bắt buộc alias cũ. [Tích hợp](/vi/integration/other-tools/).

## Dữ liệu và cloud?

Dừng writer, backup mọi thứ. Di chuyển kiểm tra snapshot/file, giữ gốc, không ghi đè, tôn trọng `DATA_DIR`. Giữ secret, identity, auth, salt, chứng chỉ. Không cloud sync cũ hay dịch vụ hosted mặc định; không mọi credential đều đảm bảo mã hóa khi lưu. [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Test lịch sử không xác minh nguồn mới; cần bằng chứng gắn SHA cuối. Test tổng hợp không chứng minh quyền hoặc hóa đơn thật.
