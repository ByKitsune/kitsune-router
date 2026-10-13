# Nhật ký thay đổi

## 0.9.8 — 2026-10-13

Xóa cảnh báo phụ thuộc nghiêm trọng và đưa vào lô Tier-1 từ phân tích đồng bộ upstream 9router. Hai mươi thay đổi, mỗi thay đổi có commit và kiểm thử riêng. Yêu cầu **Node.js >=22.19.0**. Gói vẫn là `@joyccn/zenrouter`, lệnh vẫn là `zenrouter`. Không có thay đổi API phá vỡ tương thích.

### Bảo mật

**Đã xóa mức nghiêm trọng:** `proxy-addr` (GHSA-jqcg-44mw-7w3h, giả mạo IP qua subnet tin cậy IPv4-mapped IPv6) chỉ đến từ `express`, vốn được khai báo trong `dependencies` nhưng không được import ở đâu. Phụ thuộc này bị xóa thay vì ghim phiên bản; lockfile giảm 40 gói bắc cầu. `marked` và `selfsigned` (chỉ dùng cho kiểm thử, nay là devDependency) cũng bị xóa.

**Không phải bản phát hành không có lỗ hổng.** `node-forge` GHSA-86w9-cpqp-85rv (cao) chưa có bản vá (1.4.0 là mới nhất). Trình tiêu thụ duy nhất trong sản phẩm chỉ phân tích, tạo, ký và tuần tự hóa chứng chỉ, không bao giờ gọi hàm xác minh chữ ký, nên đường xác minh RSA PKCS#1 v1.5 bị ảnh hưởng không thể truy cập từ đây. Điều này nay được khẳng định bằng kiểm thử.

### Sử dụng và tính toán

Yêu cầu chat streaming tương thích OpenAI nay gửi `include_usage`, nên cache được tính đúng giá thay vì ước lượng theo ký tự. Yêu cầu tạo ảnh Codex báo cáo token thực vào lịch sử sử dụng. Model có hậu tố effort được tính theo giá model gốc thay vì `$0`.

### Định tuyến và dự phòng

Lỗi 400 mang nghĩa "hết tín dụng" nay chuyển sang model tiếp theo trong combo thay vì làm hỏng yêu cầu. Các endpoint chat hỗ trợ ghim tài khoản `x-connection-id` với dự phòng tự động. Bộ chọn model không còn hiển thị provider có toàn bộ kết nối bị tắt.

### Dịch và giao thức

Khai báo công cụ `strict` được giữ nguyên khi dịch. `response_format` của Chat ánh xạ sang `text.format` của Responses, và trường `text` chỉ có ở Responses bị loại bỏ khi quay lại. CommandCode bị giới hạn ở 200k theo schema thật.

### Danh mục

Antigravity Claude Sonnet 5.5 / Opus 5.5, CodeBuddy CN `kimi-k2.8-preview` và `deepseek-v4.1-flash`, LongCat 2.5, bản đồ MITM theo thế hệ 3.8, và ParalonCloud. Các mục danh mục chỉ là khai báo: chúng không xác lập quyền tài khoản hay khả dụng thực tế.

### Kiểm chứng

Bộ kiểm thử độc lập: **1.386 tệp, 4.335 trường hợp — 4.234 đạt, 100 bỏ qua, 1 todo, 0 lỗi** trên Node 24.19.0; lint không có cảnh báo. Baseline registry khớp từng byte. Build sản phẩm và chạy thử standalone trên `DATA_DIR` cách ly đều đạt; không dùng tài khoản sản phẩm hay suy luận tính phí.

[GitHub release](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.8) · [Complete changelog](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Technical details](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.8.md) · [Release notes](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.8.md) · [Previous release 0.9.7 (historical)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md)

---

## 0.9.7 — 2026-10-06

Phiên bản này tập hợp toàn bộ đợt bảo trì đã hợp nhất; việc tăng số phiên bản không thêm tính năng sản phẩm riêng. Yêu cầu **Node.js >=22.19.0**. Gói vẫn là `@joyccn/zenrouter`, lệnh vẫn là `zenrouter`.

### Danh mục và định danh ứng dụng khách

Thêm **120 mục nhà cung cấp/mô hình** (100 chat, 8 hình ảnh, 6 embedding, 6 TTS) và **342 bản ghi siêu dữ liệu có nguồn**; **827 mục lịch sử chưa được kiểm chứng riêng**. Phân biệt giới hạn, giá và giá trị chưa biết giữa API, IDE/OAuth và gói lập trình. Sửa bí danh nhà cung cấp/giá, giao thức mô hình, khả năng khám phá không cần xác thực, ID dùng chung giữa các loại dịch vụ, khả năng khai báo trực tiếp, giới hạn đầu vào/ngữ cảnh/đầu ra và giá ngữ cảnh dài/tùy chỉnh. Giá theo đơn vị khác không bị biến thành giá token; giá chưa biết không có nghĩa là miễn phí. Cập nhật định danh khách đã nghiên cứu và header Gemini/Copilot theo endpoint, không cấp thêm quyền beta.

### Suy luận và ghi nhận sử dụng

Giữ giới hạn đầu ra tường minh/nullable và chế độ suy nghĩ riêng của nhà cung cấp đến bước tuần tự hóa cuối; không âm thầm tăng giới hạn trả phí. Giữ trường suy luận Responses và khả năng xen kẽ thực tế của Claude, kể cả khi thử lại sau beta bị từ chối. Ghi nhận lần gọi hết ngân sách, cộng token suy nghĩ Gemini đúng một lần, giữ trạng thái chưa hoàn tất/đầu ra một phần/từ chối, tránh ghi hai lần khi hủy sau sự kiện kết thúc và phát lại combo bị hiểu nhầm là rỗng. Không thêm tự động thử lại với ngân sách lớn hơn. Codex OAuth, OpenCode Muse và Cursor vẫn không thực thi giới hạn API công khai; giới hạn token không phải tổng ngân sách tiền.

### Tìm kiếm có căn cứ

Tên nhà cung cấp đơn và `provider/search` chọn mặc định dịch vụ, không phải tên mô hình upstream. Kiểm tra quyền sở hữu lựa chọn tường minh/thành viên combo trước khi gửi. Antigravity dùng sandbox riêng, ID dự án/request/session thật, ánh xạ mô hình/suy nghĩ, Google Search và proxy nghiêm ngặt theo tài khoản. Loại `thought: true` khỏi câu trả lời và ngữ cảnh trích dẫn. Lỗi 404 mô hình Gemini cụ thể dùng một lần thử tài khoản; lỗi 404 tài nguyên Antigravity chính xác nhưng mơ hồ dùng tối đa **ba**, không ghi cooldown cho tài khoản khỏe. Thành công chỉ xóa phạm vi tìm kiếm tương ứng; fallback xác thực/quota khác giữ nguyên.

### Phụ thuộc, trình cài đặt và giao diện

Nâng React **19.3.0**, ESLint **10.12.0**, Vitest **5.0.3**/Vite **8.3.2** và Undici **8.11.2**. Giữ dispatcher Node 22, CONNECT, ghim DNS, hủy và chính sách proxy không chuyển sang kết nối trực tiếp khi lỗi; bỏ phụ thuộc không dùng. Trình cài đặt kiểm tra mức runtime tối thiểu chính xác và CLI vừa liên kết. Đóng gói Monaco **0.57.0** cùng worker cùng nguồn, sửa markdown/chuyển ngôn ngữ tài liệu và cảnh báo React mà không mất bản nháp hay an toàn hydration. Phạm vi ESM hẹp không đổi launcher CommonJS; giữ fallback SQLite tùy chọn.

### Xuất bản phiên bản

Workflow npm/Docker thủ công yêu cầu tag ổn định thật và commit chính xác; provenance npm cũng khớp ref/SHA dispatch. Tarball gốc được lưu trước xuất bản và phục hồi sau khi kiểm tra SHA512 của registry. Tuần tự hóa toàn cục và so sánh phiên bản số ngăn lần thử lại cũ thay thế `latest` mới hơn; thiếu artifact gốc thì dừng an toàn.

### Kiểm chứng, bảo mật và giới hạn nâng cấp

Kiểm chứng trước đó gồm test cô lập, lint không cảnh báo, build ứng dụng/CLI, xuất tài liệu, kiểm tra trình duyệt và nghiệm thu loopback/standalone với SQLite cho tìm kiếm/sử dụng. Kiểm chứng cuối tại máy cục bộ: **494 tệp test, 4.091 đạt, 100 bỏ qua, 1 todo, không có lỗi** với Node 22.23.2; lint không lỗi/cảnh báo, đóng gói CLI và kiểm tra Docker đều đạt. Không dùng tài khoản sản xuất, suy luận upstream thật, thử lại tăng chi phí hay triển khai tự động. Nghiên cứu danh mục **không chứng minh quyền truy cập tài khoản hoặc khả năng phục vụ thực tế**.

Vẫn xác minh TLS; ngoại lệ chứng chỉ tự ký chỉ theo request, không toàn cục. **Cảnh báo node-forge và braces vẫn còn**: không tuyên bố bản phát hành không có lỗ hổng. Sau khi xuất bản, cài `@joyccn/zenrouter@0.9.7` hoặc dùng image ghim `joyccn/zenrouter:0.9.7`. Quy trình container chỉ nhắm **linux/amd64**; lưu bền tại **/app/data** và sao lưu trước nâng cấp. Tài liệu không xác nhận đã xuất bản hoặc tag đã tồn tại.

---

[Bản phát hành GitHub](https://github.com/ZenRouter/ZenRouter/releases/tag/v0.9.7) · [Nhật ký đầy đủ](https://github.com/ZenRouter/ZenRouter/blob/master/CHANGELOG.md) · [Chi tiết kỹ thuật](https://github.com/ZenRouter/ZenRouter/blob/master/docs/CHANGELOG_v0.9.7.md) · [Ghi chú phát hành](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.7.md) · [Phiên bản trước 0.9.6 (lịch sử)](https://github.com/ZenRouter/ZenRouter/blob/master/releases/RELEASE_NOTES_v0.9.6.md)
