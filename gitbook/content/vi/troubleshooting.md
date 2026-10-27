# Khắc phục sự cố

Thu thập version/SHA hiện tại, `DATA_DIR` tuyệt đối, route và lỗi đã xóa secret. Không xóa trạng thái, thay toàn config hay lộ key vì đổi tên.

## Startup và di chuyển

- Không có gói: nguồn 1.0.2 đã xác minh nhưng npm publish bị E403 (2FA hoặc granular token bật bypass 2fa), readback HTTP 404. Người dùng sẽ thay secret qua GitHub UI, chưa xác nhận; không chia sẻ token. Dùng [nguồn](/vi/getting-started/installation/) đến khi xác minh xuất bản/readback. Nguyên nhân npm 1.0.1 vẫn chưa rõ.
- GHCR pull bị từ chối/không thấy: 1.0.2 đã xuất bản và readback xác thực/smoke qua, nhưng gói vẫn **private** ở lần đọc cuối; grant ẩn danh HTTP 401. Chủ chọn Public chưa xác nhận hoàn tất. Dùng quyền đọc private hoặc đợi Public/readback ẩn danh; không hiểu nhầm từ chối quyền bị che thành chưa xuất bản. Lỗi preflight/context cũ giữ trong [vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md#publication-recovery-without-moving-the-tag). Không chia sẻ token.
- Node cũ: >=22.19.0; migration cần snapshot SQLite native Node/Bun hỗ trợ, không raw-copy không an toàn.
- Cổng bận: API/dashboard cùng 20128. Xác định chủ và dừng nhẹ nhàng, không `pkill`/`kill -9` diện rộng.
- Trạng thái trống: kiểm tra path/mount `/app/data`; `DATA_DIR` rõ ràng không được tự chuyển.
- Bị từ chối migration: dừng nguồn/helper, kiểm tra an toàn, integrity, ownership, target. Không xóa lock mù quáng. [Hướng dẫn](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
- Linux hạn chế: production vẫn fail-closed nếu ownership same-UID không đọc được. Test cô lập không cho phép migration non-root chung. Sau dừng/backup, dùng `DATA_DIR` giữ nguồn không chuyển hoặc nhờ review đặc quyền; không bỏ qua permission. Smoke UID 65534 giới hạn không chứng minh hỗ trợ chung hay tag cuối.

## Client

```bash
curl http://localhost:20128/api/health
curl http://localhost:20128/v1/models \
  -H "Authorization: Bearer $KITSUNE_ROUTER_API_KEY"
```

Khóa gateway, không refresh token. OpenAI dùng `/v1`; Claude Code origin; Codex TOML `kitsunerouter`/Responses. Lệnh `kitsune-router`; giữ cài đặt khác.

404/410 kiểm tra model; 429/503 tôn trọng reset/retry/cancel. Tài liệu/tham số không hỗ trợ cần thay đổi tường minh, không bỏ âm thầm. Giá chưa rõ không miễn phí, estimate không phải hóa đơn. Không đính thư mục, `.env`, key, chứng chỉ. [Issue](https://github.com/ByKitsune/kitsune-router/issues) cần tái hiện tối thiểu đã ẩn dữ liệu. [Vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md).
