# Câu hỏi thường gặp

**1.0.8 đang được chuẩn bị, chưa xuất bản.** Cần hoàn tất CI cho SHA chính xác và phép thử cài đặt bình thường của bản ứng viên trước khi tạo tag hoặc xuất bản.

**Lưu ý về 1.0.7:** GitHub Release, npm và Docker đã được xuất bản từ `b7f77d07`, nhưng các lần cài SQLite và khay hệ thống tuần tự bằng `--no-save` có thể xóa phụ thuộc của nhau. Xem kết quả và giới hạn quan sát trong [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md).

## Kitsune Router là gì?

Gateway trung lập, local-first do [ByKitsune](https://bykitsune.com) duy trì/tài trợ, tiếp nối ZenRouter/9Router. **Your models. Your routes.** Gửi tới upstream bạn cấu hình, không tự tới nhà tài trợ.

## 1.0.8 đã sẵn sàng chưa?

Mục tiêu hiện tại là **1.0.8**. [Bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) phân biệt kết quả thực tế của GitHub Release, npm và GHCR. Không coi một bản phân phối đã xuất bản hoặc container đã công khai khi chưa xác nhận đọc lại. Nếu một kênh còn chờ hay bị từ chối, dùng [mã nguồn](/vi/getting-started/installation/) hoặc quyền truy cập được phép mà bản ghi nêu rõ.

**Ghi chép lịch sử của 1.0.2; không xác định trạng thái của 1.0.6:** **Container đã xuất bản nhưng private; npm vẫn bị chặn.** Recovery `40485038668` xuất bản runtime bất biến `65c8b97d`, readback xác thực digest/provenance/SPDX và smoke độc lập image đã xuất bản qua. Chủ chọn Public nhưng chưa xác nhận; grant ẩn danh HTTP 401 ở lần đọc cuối. Dùng quyền private được phép hoặc nguồn, không mặc định pull ẩn danh. npm vẫn E403/readback công khai HTTP 404, thay token chưa xác nhận. Không GitHub Release 1.0.2 hay production; tag cũ giữ bằng chứng riêng, nguyên nhân npm 1.0.1 vẫn chưa rõ. [Cài đặt](/vi/getting-started/installation/) · [Bằng chứng](/vi/changelog/).

## Bắt buộc tài khoản/thứ tự?

Không cần ByKitsune. Chọn account/combo riêng; quyền, thuê bao, vùng và điều khoản upstream vẫn áp dụng.

## Miễn phí/vô hạn?

MIT là giấy phép phần mềm, không loại bỏ chi phí upstream/hardware/quota. Nén không hứa tỷ lệ; ước tính không phải hóa đơn, chưa rõ không thành không.

## Định danh nào đổi?

Gói `@bykitsune/router`, lệnh `kitsune-router`, provider `kitsunerouter`, biến `KITSUNE_ROUTER_*`, header `x-kitsune-router-*`. `/v1/*`, `/v1beta/*`, 20128 giữ nguyên; không bắt buộc alias cũ. [Tích hợp](/vi/integration/other-tools/).

## Dữ liệu và cloud?

Dừng writer, backup mọi thứ. Di chuyển kiểm tra snapshot/file, giữ gốc, không ghi đè, tôn trọng `DATA_DIR`. Giữ secret, identity, auth, salt, chứng chỉ. Không cloud sync cũ hay dịch vụ hosted mặc định; không mọi credential đều đảm bảo mã hóa khi lưu. [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).

Test lịch sử không xác minh nguồn mới; cần bằng chứng gắn SHA cuối. Test tổng hợp không chứng minh quyền hoặc hóa đơn thật.
