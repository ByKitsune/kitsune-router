# Nhật ký thay đổi

## Kitsune Router 1.0.5 — chốt mã nguồn ngày 2026-10-31

Phiên bản 1.0.5 tổng hợp các ghi chép phát triển mã nguồn có ngày ở bên dưới.
Bổ sung kiểm tra nonce OIDC rõ ràng, giới hạn vòng đời tài nguyên danh mục Kiro,
giữ lỗi kết thúc luồng model và nội dung hình ảnh Cloudflare. Bao gồm tích hợp
ByKitsune, phiên bản client và danh mục theo provider đã xác minh, độ chính xác
usage/giá đã ghi nhận và điều hướng dashboard mượt hơn.

Phiên bản mã nguồn, kiểm tra cục bộ và hiện vật đã phát hành là các bằng chứng
riêng biệt. Mục này không xác nhận phát hành npm/GHCR, GitHub Release hay triển
khai mới. Hồ sơ và tag 1.0.2 giữ nguyên; nguồn provider bị chặn và giá chưa rõ
vẫn có các giới hạn đã ghi nhận.

[Chi tiết mã nguồn](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.5.md) · [Trạng thái mã nguồn và hiện vật](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.5.md).

Đợt cập nhật npm ổn định cũng đồng bộ Next/React, xử lý tương thích SAML/PKI và sửa kiểm tra dependency CI, giữ nguyên các kiểm tra bảo mật.

[Dependency / CI evidence](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/27-dependency-upgrade-and-ci-repair-2026-10-31.md).

## Chưa phát hành — kiểm tra giá, capability và bản địa hóa

- Kiểm tra toàn bộ 1.302 dòng registry theo bản dựng từ mã nguồn models.dev
  chính thức đã ghim. Bỏ giới hạn token chung không có bằng chứng, sửa capability
  theo sản phẩm và giới hạn output của CommandCode/combo.
- Thêm quan sát giá bất biến đã xác minh, thử cập nhật mỗi sáu giờ và áp dụng
  trong 24 giờ theo thời gian request. Giá chưa rõ, gói đăng ký hoặc đơn vị khác
  không trở thành chi phí miễn phí.
- Giải thích nguồn giá và khoảng thiếu dữ liệu qua chẩn đoán chỉ đọc;
  giữ bộ đếm cache Ollama và bổ sung đường đọc quota/balance Cloud.
- Sửa dịch văn bản/thuộc tính động, bảo vệ mã và ID, mở rộng danh mục văn bản UI
  cùng các từ điển.

[Báo cáo đầy đủ và giới hạn](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/22-pricing-capability-localization-2026-10.md).

## Chưa phát hành — cập nhật mã nguồn 2026-10-29

Các thay đổi mã nguồn này tách biệt với hiện vật 1.0.2; chúng không chứng minh
đã phát hành, triển khai, có quyền truy cập thực tế hay khớp hóa đơn.

- Thêm GPT-6.1 Terra vào danh mục OpenAI và Codex; tuyến OpenAI dùng Responses
  để giữ công cụ. Giá API là ước tính, không phải hóa đơn thuê bao Codex.
- Đồng bộ header CommandCode 1.88, cách ly phiên của yêu cầu được chuyển đổi và
  giữ cùng mã phiên khi thử lại.
- Giữ giới hạn mảng hợp lệ của schema Google và phân biệt lỗi vượt ngữ cảnh
  Copilot đã quan sát với lỗi hết hạn mức tài khoản.
- Các cập nhật usage đã ghi được gom để tải lại thống kê và biểu đồ theo kỳ đã
  chọn; dữ liệu cũ giữ nhãn kỳ và khi lỗi có nút thử lại. Thông tin request trực tiếp vẫn
  được truyền riêng; nguyên nhân lỗi trình duyệt ban đầu chưa được xác nhận.
- Tạo giọng và embedding Ollama Local cần kết nối đang hoạt động, khóa API là
  tùy chọn. Giọng mặc định WAV, hỗ trợ PCM và WAV trong JSON, từ chối MP3; thẻ
  và danh sách embedding không chứng minh model đã được cài.
- Bỏ giá dự phòng chung không theo phạm vi làm giảm độ bao phủ cho usage tương
  lai: một số tuyến thuê bao hoặc gateway từng có giá số nay không rõ; lịch sử đã
  lưu không đổi. Giá tham khảo theo đúng provider/model không phải hóa đơn; chỉ
  một nhóm nhỏ model văn bản cho ước tính trong 24 giờ từ lúc ghi nhận.

[Rà soát mã nguồn và giới hạn](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/21-upstream-9router-2026-10-29.md#2026-10-29-source-follow-up)

## Chưa phát hành — giao diện, điều hướng di động và agent skills

Nguồn hiện tại cập nhật bố cục dashboard, phông DM Sans đóng gói cục bộ, chuyển
động Usage, hình ảnh chính thức ByKitsune, điều hướng nhanh trên di động và bộ
chọn ngôn ngữ có tìm kiếm. Cả chín agent skill được rà soát theo discovery,
xác thực, request và response thực tế của gateway. Các thay đổi không di chuyển
tag 1.0.2 bất biến và không xác nhận phát hành npm/container, docs hay production.
Xem [changelog nguồn](https://github.com/ByKitsune/kitsune-router/blob/master/CHANGELOG.md#unreleased)
và [hướng dẫn UI](https://github.com/ByKitsune/kitsune-router/blob/master/docs/UI-DESIGN.md).

## Kitsune Router 1.0.2 — container private đã xuất bản; pull ẩn danh chờ; npm bị chặn

Tag bất biến **`65c8b97d783becab3f1e1210d2ab9ce67992e13b`**, PR #2 merge `23375bf1`. SSH nguồn chính xác: **9.041 qua, 100 skip, không lỗi assertion/suite**; lint nghiêm ngặt, 18 docs tests/export tĩnh, app build và pack qua. CI `40468830176` xanh trên cây nguồn khớp tag. Smoke tarball local, sáu tình huống restart container và browser nguồn chính xác qua trong phạm vi ghi nhận. Chỉ mock child `Date`, không đổi thứ tự production; warning log chỉ cho npm publish, không pack.

npm `40469972263` qua gate/docs/pack rồi publish bị **E403** (cần 2FA hoặc granular token bật bypass 2fa), readback HTTP 404. Hiện vật CI gốc `12718343077`, SHA-256 `a52d736ade6b8cbcf17ba114c9b55018956a7f1b35c4280edcae2912de8a3114`, khác byte tarball local; cả hai độc lập qua help/version/runtime/upgrade smoke, giữ trạng thái/khóa gốc, secrets 0600 và thoát 0. Người dùng thay token qua GitHub UI chưa xác nhận; nguyên nhân npm 1.0.1 vẫn chưa rõ.

GHCR cũ `40469972099` lỗi trước build/push; recovery đầu `40483141695` lỗi trước registry do context `GITHUB_SHA`. PR #4 merge `802c61bf` dùng xác minh nguồn API tường minh. Recovery thành công **`40485038668`** dùng tooling đó xuất bản runtime không đổi `65c8b97d`, gate 9.041/100 skip/không lỗi, labels/SLSA v1/SPDX và promote `latest` qua. Readback xác thực độc lập xác nhận index hai tag **`sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`**. Image đã xuất bản `af6416b6` qua kiểm tra 16 lớp/rootfs và sáu start/restart SSH thật, khỏe ở 1.0.2, khóa ổn định/0600. Gói vẫn **private**, chọn Public chưa xác nhận, grant ẩn danh HTTP 401. npm bị chặn; không GitHub Release/production, preview chưa cập nhật. Giữ lỗi cũ và định danh tooling/runtime/hiện vật tách biệt. [Bằng chứng 1.0.2](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.2.md) · [Chi tiết](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.2.md).

## Kitsune Router 1.0.1 — lần thử bất biến; chưa xác lập xuất bản

Tag `v1.0.1` giữ ở **`745834026a5a9f55dffce40c0ad01bf3106e8237`**; PR #1 merge master `ce752a9f`. SSH **9.039 qua, 100 skip, không lỗi**; CI `40463259397` qua. GHCR `40465152324` gate nguồn chính xác **9.038 qua, một lỗi** tại `db-scoped-cache:216`, trước login/push; không xuất bản image chính thức 1.0.1.

npm `40465152995` qua gate chính xác/docs build/pack rồi publish lỗi. Output dài bị cắt nên chưa rõ nguyên nhân. Lưu hiện vật gốc `12716498091`, tarball SHA-256 `f00e2f581631065a9afa4719999487bf2f5eba31c096393d2a9141fb13bd55e8`; readback công khai HTTP 404 ngày 2026-10-27, không GitHub Release 1.0.1. [Lần thử](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.1.md). **58 test di chuyển đã gồm tám denial**, production vẫn fail-closed cho same-UID không đọc được. Bằng chứng Linux UID 65534 không chứng nhận non-root chung; Windows/macOS native chưa xác minh. ByKitsune PR #6 merge `73a14982`, không triển khai production. Số cũ không xác minh 1.0.2.

## Kitsune Router 1.0.0 — giữ lần thử; không xuất bản npm/GHCR

Tag bất biến `v1.0.0` ở `390a65677c06a30084386d2a2adf8b0c48709281`; workflow lỗi ownership non-root trước xuất bản. **9.029 test qua** là bằng chứng ứng viên đó, không của 1.0.1. Giữ phạm vi lần thử bên dưới.

**Your models. Your routes.** [ByKitsune](https://bykitsune.com) duy trì/tài trợ, không bắt buộc account/thứ tự provider. Đích: `ByKitsune/kitsune-router`, npm `@bykitsune/router`, lệnh `kitsune-router`, provider `kitsunerouter`, image `ghcr.io/bykitsune/kitsune-router`.

Dừng writer, backup toàn bộ. Di chuyển kiểm tra `~/.zenrouter`/`~/.9router` → `~/.kitsune-router`, giữ gốc, không ghi đè đích; `DATA_DIR` tường minh ưu tiên. Giữ secret/auth/salt/chứng chỉ tin cậy. Biến `KITSUNE_ROUTER_*`, header `x-kitsune-router-*`; `/v1/*` và 20128 không đổi.

Lần thử lỗi không xuất bản npm/GHCR. Giữ tag, phạm vi và bằng chứng; bản tiếp theo hiện tại 1.0.2 còn chờ. [Lần thử](https://github.com/ByKitsune/kitsune-router/blob/master/releases/RELEASE_NOTES_v1.0.0.md) · [Chi tiết lịch sử](https://github.com/ByKitsune/kitsune-router/blob/master/docs/CHANGELOG_v1.0.0.md) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).

> **Lưu trữ lịch sử:** phần sau giữ tên, hiện vật, URL và bằng chứng ZenRouter gốc; không phải phát hành Kitsune 0.x hay xác minh nguồn hiện tại. Dùng [cài đặt mới](/vi/getting-started/installation/), không lệnh nâng cấp cũ. Công việc Unreleased bên dưới được ghi trước đề xuất đổi thương hiệu.

## Lịch sử trước đổi thương hiệu — đối soát tháng Mười

- Sửa lời gọi đệ quy giữa fetch của Next.js và lớp truyền tải gateway; khôi phục chat, làm mới OAuth, usage và danh mục mà không đổi chính sách tài khoản hoặc proxy.
- Kiểm tra dependency trực tiếp đã cài so với lockfile trước khi build/test. Cài lại bằng `npm ci` để không đóng gói Next.js/Undici cũ; không thay đổi các gói 0.9.13 đã phát hành.

[Khôi phục truyền tải và build mã nguồn có thể tái lập](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/20-fetch-transport-recovery-2026-10.md)

- Cập nhật định danh phiên bản ổn định và danh mục đã kiểm chứng; kiểm toán giá theo nhà cung cấp và đơn vị tính phí riêng của media. Giá theo khung giờ và giá thay thế công bố dùng thời điểm usage đã ghi trước khi áp dụng ghi đè của người vận hành.
- Hiển thị giá hiệu lực hoặc chưa biết cho mọi model đã đăng ký, thêm tìm kiếm giữ nguyên chỉnh sửa; phân biệt gói tài khoản, client và tín dụng thuê bao với hóa đơn API.
- Sửa giá các tuyến miễn phí chính xác của TokenHarbor và bậc tốc độ thực tế được cung cấp; tách thời hạn ghi bộ nhớ đệm, chi phí chưa biết và cấu hình ghi đè rõ ràng.
- Hiển thị tổng phụ đã biết cùng số yêu cầu chưa có giá, không thay tổng chưa biết bằng tổng phụ hoặc tính lại lịch sử.
- Đồng bộ xác thực, lưu trữ riêng tư, hủy/proxy, giới hạn suy luận và chỉ số lỗi; áp dụng chọn lọc các bản sửa giao thức và CLI tháng Mười đã tái hiện.
- Đồng bộ kiểm chứng mã nguồn và bảo vệ phát hành. Không sửa hồi tố gói 0.9.13 bất biến và không chứng minh quyền truy cập hay hóa đơn thực tế.

[Phạm vi, nguồn và giới hạn kiểm chứng](https://github.com/ZenRouter/ZenRouter/blob/master/docs/audit/17-october-reconciliation-2026-10.md)

## 0.9.13: 2026-10-19

- Sửa lỗi ngân sách thinking giả khi thử mô hình Claude của Antigravity; lưu mặc định thinking mà không đổi giới hạn đầu ra do khách đặt rõ ràng.
- Thêm lựa chọn Auto, Standard, Fast và Ultrafast độc lập cho OpenAI/Codex, dùng `service_tier` gốc và tuyến Responses phù hợp.
- Giữ tệp tải lên và tệp đính kèm công cụ; chỉ bỏ qua tài khoản không đủ điều kiện trong yêu cầu hiện tại, không phạt trạng thái hay hạ mức tốc độ.
- Ngăn phản hồi bất đồng bộ cũ ghi đè lựa chọn hoặc xác nhận kết quả thử cho cấu hình mới. Phân biệt mức yêu cầu, mức thực tế và chi phí cao cấp chưa biết.
- Kiểm chứng: 6.248 ca thông thường đạt trên Node 22/24, thêm 3 lỗi dự kiến và 100 ca tùy chọn bỏ qua. Kiểm thử mô phỏng không xác nhận quyền dùng thật, tốc độ hay hóa đơn; chế độ nhanh có thể tốn hơn.

[Ghi chú phát hành](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/releases/RELEASE_NOTES_v0.9.13.md) · [Chi tiết kỹ thuật](https://github.com/ZenRouter/ZenRouter/blob/v0.9.13/docs/CHANGELOG_v0.9.13.md)

## 0.9.12: 2026-10-19

- Giữ ảnh công cụ đúng kiểu và lựa chọn thinking qua yêu cầu gốc/chuyển đổi, kể cả Ollama và CommandCode.
- Bảo toàn cấu hình OpenCode JSONC; làm mới bộ nhớ đệm xác thực, mô hình và hạn mức sau khi nhập cơ sở dữ liệu.
- Loại bỏ chuỗi phụ thuộc node-forge, siết chặt proxy/DNS và dừng thử lại khi khách hủy yêu cầu.
- Bổ sung CLI/hạn mức Antigravity Argon và sửa giá, vòng đời mô hình có nguồn đối chiếu; không tự nâng giới hạn ngữ cảnh hay đầu ra.
- Kiểm chứng mã: 6.052 ca đạt trên Node 22/24, bỏ qua 100 ca tùy chọn, không có lỗi; bốn lockfile không có cảnh báo. Kết quả không xác nhận quyền truy cập nhà cung cấp thật hoặc bảo đảm an toàn tuyệt đối.

[Ghi chú phát hành](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/releases/RELEASE_NOTES_v0.9.12.md) · [Chi tiết kỹ thuật](https://github.com/ZenRouter/ZenRouter/blob/v0.9.12/docs/CHANGELOG_v0.9.12.md)

## 0.9.11: 2026-10-17

Bản này sửa xử lý ảnh nhiều lượt, tham số suy luận, lỗi giao thức gốc và ước tính chi phí trong ZenRouter đã tùy chỉnh.

- Giữ ảnh đúng kiểu qua kết quả công cụ, lịch sử đã rút gọn, nén văn bản và chuyển đổi nhà cung cấp; không biến base64 thành văn bản.
- Giữ tham số thinking, ID công cụ, chữ ký và lỗi SSE/JSON. Tham số gốc không hỗ trợ trả lỗi rõ ràng; yêu cầu sai không khóa tài khoản đang hoạt động tốt.
- Đối chiếu từng sản phẩm nhà cung cấp và ID mô hình với dữ liệu models.dev ngày 17 tháng 10. Tách riêng giới hạn ngữ cảnh, đầu vào và đầu ra; phân biệt chi phí chưa biết với mức giá miễn phí bằng không.
- Chỉ lưu giá đã chỉnh sửa. Gemini 2.5 Pro và Flash-Lite vẫn được liệt kê cho dự án đã đủ điều kiện; kết luận ngừng toàn cầu trước đây là sai.

**Cảnh báo bảo mật:** [node-forge GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) vẫn chưa được xử lý trong ứng dụng và CLI; GitHub chưa liệt kê bản vá. Kiểm thử giao thức không xác minh quyền dùng tài khoản thật hoặc hóa đơn.

[Ghi chú phát hành](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/releases/RELEASE_NOTES_v0.9.11.md) · [Chi tiết kỹ thuật](https://github.com/ZenRouter/ZenRouter/blob/v0.9.11/docs/CHANGELOG_v0.9.11.md)

## 0.9.10 — 2026-10-16

Bản vá cho các thay đổi được thực hiện khi xác minh lại các phát hiện kiểm toán với mã nguồn, sau khi 0.9.9 được phát hành. Phiên bản npm là bất biến, nên chúng chưa từng nằm trong bản phát hành nào. Không có thay đổi API phá vỡ tương thích; hai cột cơ sở dữ liệu được thêm tự động ở lần khởi động đầu tiên.

### Đã sửa

**Các mô hình đã ngừng hoạt động không còn được quảng cáo.** `gemini-2.5-pro` và `gemini-2.5-flash-lite` đều trả 404 *"is no longer available to new users"* — tái hiện 5/5 và 2/2, cùng 30 ngày nhật ký sản xuất xác nhận. Cả hai đều được liệt kê và trông như dùng được. Nay chúng bị ẩn trong khi id vẫn nằm trong sổ đăng ký, để combo đã lưu phân giải thành lỗi rõ ràng thay vì 404.

**Mười lăm mô hình `deprecated` vẫn được cung cấp.** Cờ này tồn tại và có tài liệu, nhưng chỉ được dùng bởi giao diện bảng điều khiển — không có bộ lọc nào trên đường API. Tái hiện với một kết nối deepseek đang hoạt động: hai bí danh tương thích đã ngừng được liệt kê. Nay đã lọc, với một phân biệt quan trọng: `deprecated: true` ở **cấp nhà cung cấp** là cảnh báo rủi ro ToS cho claude/codex/antigravity/… và không được ẩn các mô hình của nhà cung cấp đó.

**Cửa sổ ngữ cảnh Gemini bị giữ lại, không phải chưa biết.** Mười một bản ghi khai báo cửa sổ chưa xác minh, khiến nó bị null; vì `/v1/models` chỉ phát `context_length` khi giá trị hữu hạn, **17 trong 334 mô hình** đến tay khách hàng mà không có cửa sổ nào. Các mục chính thức của models.dev công bố 1.048.576 cho những id này và các tuyến vẫn phục vụ, nên việc xóa con số là lựa chọn tồi nhất. Nay còn **12** mô hình thiếu cửa sổ, mỗi mô hình thực sự không phục vụ được hoặc thực sự chưa xác minh.

**Hai lỗi dịch gây mất dữ liệu âm thầm.** `openai-to-cursor` ghi đè `max_tokens` của khách hàng bằng 32000 cố định — khách yêu cầu 200 nhận được 32000; nay hằng số này là mức sàn, không phải ghi đè. `openai-to-commandcode` biến đối số công cụ sai định dạng thành `{}` không có tín hiệu, nên mô hình nhận được lệnh gọi công cụ không có tham số và không có gì báo hiệu mất mát.

### Đã thêm

**TTFT cuối cùng đã đo được.** Trình xử lý luồng đã tính thời gian tới token đầu tiên và in ra, nhưng chưa bao giờ lưu — đó là lý do kiểm toán phải phân tích 304 dòng nhật ký để báo cáo trung vị 5.471 ms. Nay nó được lưu vào các cột cho phép NULL (ghi là NULL, không bao giờ là 0, để các yêu cầu chưa đo không kéo trung vị xuống) và được công bố dưới dạng `zenrouter_ttft_ms{quantile=...}` trên `/api/metrics`.

### Ghi chú

Ba phát hiện trong bản này đến từ việc xác minh lại kết luận trước đó thay vì tin tưởng nó: kiểm toán báo cáo **3** mô hình có `context_length` null nhưng con số thực là **17**; `gemini-3.5-flash-lite` xuất hiện cạnh các mô hình thực sự đã ngừng nhưng trả **HTTP 200** (429 trước đó là hạn mức); và 250.000 hóa ra là giới hạn của *cầu Antigravity* cho `claude-sonnet-4-6`, không phải cửa sổ API Anthropic vốn là 1.000.000.

## 0.9.9 — 2026-10-15

> **Nâng cấp từ 0.9.7? Bản này cũng bao gồm 0.9.8.** Lô 0.9.8 được chuẩn bị ngày 2026-10-13 nhưng không phát hành khi đó; nó đã được **phát hành bổ sung vào 2026-10-16** như một bản riêng, với `latest` vẫn là 0.9.9 trên mọi registry. 0.9.9 là 45 commit trong khoảng `v0.9.7` đến `v0.9.9`, nên chứa mọi thứ của 0.9.8 — gỡ bỏ cảnh báo phụ thuộc nghiêm trọng và các cổng Tier-1 — cùng mọi thứ dưới đây. **Nên dùng 0.9.9:** 0.9.8 không có bản sửa lỗi kiểm toán nào.

Giải đáp một cuộc kiểm toán bên ngoài (11 tài liệu) cùng đợt xác minh toàn bộ danh mục theo [models.dev](https://models.dev). Mọi phát hiện đều được tái hiện trên cổng đang chạy trước khi sửa, và mỗi bản sửa đều kèm kiểm thử hồi quy. Yêu cầu **Node.js >=22.19.0**. Gói vẫn là `@joyccn/zenrouter`, lệnh vẫn là `zenrouter`. Không có thay đổi API phá vỡ tương thích.

### Bảo mật

**Một khách hàng không còn có thể rút cạn mọi nhà cung cấp.** Bảng `apiKeys` hoàn toàn không có cột hạn mức và `validateApiKey()` chỉ trả về boolean, nên không có gì giới hạn mức tiêu thụ của *khách hàng* — giới hạn duy nhất là bộ giới hạn đăng nhập bảng điều khiển và thời gian hồi của tài khoản *thượng nguồn*. `/v1` nay có giới hạn theo khoá (600 RPM, đột biến 120/giây, `V1_RATE_LIMIT_RPM`/`V1_RATE_LIMIT_BURST`), khoá nhóm được băm, bảng đếm có giới hạn, và `Retry-After` cùng `x-ratelimit-*` khi trả 429. Giá trị mặc định lấy từ lưu lượng đo được (đỉnh ~246 yêu cầu/phút → dư ~30 lần).

**Chi tiết định tuyến nội bộ không còn rò rỉ.** Môi trường thật trả về `"No active credentials for provider: openai"`, nêu tên nhà cung cấp thượng nguồn. Cách diễn đạt tương tự cũng có trong các trình xử lý hình ảnh, video, tìm kiếm, tts, stt, embeddings, fetch và Gemini gốc. Khách hàng nay nhận thông báo trung tính; các chẩn đoán máy đọc được do chính Zen tạo (`output_budget_exhausted` và tương tự) vẫn được chuyển tiếp.

**Email tài khoản đã rời khỏi nhật ký.** Journald có 589 dòng chứa 27 địa chỉ duy nhất, vì `connectionName` phân giải thành `displayName || name || email || id`. Danh tính nay là một hàm băm ngắn có muối — vẫn tìm kiếm và phân biệt được, không thể đảo ngược.

**Token bị thu hồi là vĩnh viễn, không tạm thời.** `token_revoked` không khớp quy tắc nào và rơi vào thời gian hồi 401 chung, nên một tài khoản đã chết bị thử lại mỗi 2 phút: 31 sự kiện trong 8 giờ, một tài khoản bị thử lại 16 lần. Nay là thời gian hồi 1 giờ kèm trạng thái `needs_reauth`. Việc thử làm mới được giữ lại có chủ đích: khác với từ chối theo chính sách tổ chức, token bị thu hồi có thể vẫn cứu được.

**Tiêu đề bảo mật cơ bản và danh sách CORS tường minh.** Cổng được công bố qua đường hầm Cloudflare (`zen.hlcyn.xyz` → `127.0.0.1:20128`), nên đây không phải chuyện hình thức.

### Đã sửa

**Tự cập nhật hoạt động trở lại.** Mã nguồn truy vấn npm bằng tên trần `zenrouter`, vốn chưa được đăng ký (404), nên `/api/version` luôn báo `latestVersion: null` và lệnh cài đặt của trình cập nhật sẽ thất bại. Tên có phạm vi `@joyccn/zenrouter` nay là một hằng số dùng chung cho tuyến phiên bản, trình cập nhật và trang đích.

### Định tuyến và lỗi

**Tràn ngữ cảnh không còn báo là 502.** Câu lệnh quá dài đến dưới dạng `context_length_exceeded` bên trong luồng SSE trạng thái 200 và bị chuyển thành 503 → 502. ByKitsune thử lại 502, nên một câu lệnh không thể thành công bị thử lại trong khi mọi tài khoản khoẻ mạnh lần lượt bị khoá 30 giây. Nay là 400 với `invalid_request_error`, không xoay tài khoản.

**Cửa sổ ngữ cảnh bị báo thấp tới 778k token.** `/v1/models` công bố giới hạn của Codex CLI (872.000; 272.000 với GPT-5.6) như `context_length`. Đo thực tế: 402.486 token được chấp nhận cho mô hình quảng cáo 272.000, và 902.486 cho mô hình quảng cáo 872.000, với giới hạn thật là 922.000. GPT-6/GPT-5.6 nay báo theo đặc tả API (1.050.000 / 922.000 / 128.000); giới hạn CLI vẫn nằm ở `limits.cliDefaultContext`/`cliMaxContext`.

**Lỗi giữa luồng nay đánh dấu tài khoản.** Trước đây tài khoản lỗi sau tiêu đề 200 vẫn nằm trong vòng xoay, nên mọi yêu cầu trả 200 với nội dung bị cắt và không có chuyển đổi dự phòng — một sự cố mà giám sát theo mã trạng thái không thấy được. Khách ngắt kết nối không thể chạm nhánh này.

**`Retry-After` của nhà cung cấp là mã chết.** `checkFallbackError` nhận một `Response` để đọc tiêu đề, nhưng không lời gọi nào truyền vào, nên nhà cung cấp trả `Retry-After: 3600` bị thử lại sau vài giây.

**Ngoại lệ bất ngờ được ghi lại.** Một `catch {}` trần trả 500 chung kèm `serverRequestId` không xuất hiện ở đâu trong nhật ký. Nay tên, thông báo và ngăn xếp lỗi được ghi cùng id đó. Nội dung câu lệnh và phản hồi thì không bao giờ.

### Dịch thuật

`top_p`, `stop`/`stop_sequences`, `seed` và `metadata.user_id` bị mất qua nhiều chặng, nên khách đặt `stop: ["</end>"]` nhận đầu ra không bị cắt mỗi khi cổng định tuyến sang Claude. Kết quả công cụ thất bại được báo qua trường `is_error` phi tiêu chuẩn mà tin nhắn công cụ của OpenAI không có, nên mô hình nhận có thể tưởng công cụ đã thành công; nay là dấu `[tool_error]` trong nội dung.

### Danh mục

Năm cửa sổ được sửa theo mục chính thức của nhà cung cấp trên models.dev: `gpt-4.1*` (1.000.000 → 1.047.576), `command-a-translate-08-2025` (128.000 → 8.000, quảng cáo thừa 16 lần), `ministral-3b/8b/14b` (128.000 → 131.072/262.144), `codestral-latest` (128.000 → 256.000). So sánh ngây thơ báo 206 khác biệt; sau khi loại trừ quy ước đơn vị (256000 so với 262144) và giới hạn riêng của cổng, còn 5 khác biệt thật. Bốn tuyến Codex bị tài khoản ChatGPT từ chối (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini`, `gpt-5.3-codex-spark`) nay mang `routeAvailable: false` kèm lý do máy đọc được.

### Điểm cuối mới

`GET /api/health` nay là phép dò thật: đọc cơ sở dữ liệu, **503** khi kho lưu trữ không phản hồi, kèm thời gian hoạt động, phiên bản, số tài khoản đang khoá và số cần xác thực lại. `GET /api/metrics` phục vụ văn bản Prometheus (mô hình đang dùng, lỗi theo mã trạng thái, yêu cầu đang xử lý), có cổng token và chỉ tổng hợp.

### Xác minh và giới hạn

Bộ kiểm thử tách biệt: **1.436 tệp, 4.525 trường hợp — 4.424 đạt, 0 lỗi**; `npx eslint .` sạch. Đường cơ sở đăng ký giống hệt từng byte. Đã xác minh khi chạy với `DATA_DIR` tách biệt: JSON sức khoẻ, tiêu đề bảo mật, danh sách CORS, 429 kèm `Retry-After`, và metrics trả 401 khi chưa xác thực. Công việc danh mục là siêu dữ liệu: không xác lập quyền sử dụng hay khả dụng trực tiếp, và 448 dòng không có tham chiếu models.dev. Không phải bản phát hành không có lỗ hổng: cảnh báo `node-forge` vẫn chưa có bản sửa thượng nguồn và đường ảnh hưởng vẫn không thể tới, điều này được khẳng định bằng kiểm thử.

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
