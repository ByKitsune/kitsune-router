# VPS và container

Remote là gateway **do bạn quản lý**, không endpoint hosted đi kèm. Localhost là máy gửi request. Không cần ByKitsune hay thứ tự provider bắt buộc.

## Dịch vụ nguồn

Node.js >=22.19.0, dependency khóa, build từ root theo [cài đặt](/vi/getting-started/installation/). Service manager dùng `DATA_DIR` tuyệt đối riêng tư, secret ổn định và mật khẩu mạnh; không commit key vào unit/image.

## Container

**Mục tiêu hiện tại: `ghcr.io/bykitsune/kitsune-router:1.0.7`, chỉ linux/amd64.** Chỉ dùng ví dụ sau khi [bản ghi phát hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md) xác nhận xuất bản, digest và quyền truy cập của 1.0.7. Không mặc định có thể pull ẩn danh hoặc dùng lại digest lịch sử của 1.0.2. [Hướng dẫn Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md) ghi các bước và kết quả xác minh hiện tại.

**Ghi chép lịch sử của 1.0.2; không xác định trạng thái của 1.0.6:** **GHCR 1.0.2 đã xuất bản nhưng private.** Recovery `40485038668` dùng tooling `802c61bf` và runtime bất biến `65c8b97d`, readback xác thực digest/provenance/SPDX và smoke image đã xuất bản qua. `1.0.2`/`latest` chung index `sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`. Ví dụ của 1.0.2 yêu cầu quyền private GHCR được phép, hoặc chờ chủ hoàn tất Public và readback ẩn danh thành công. Chọn Public chưa xác nhận, grant ẩn danh HTTP 401. Chỉ **linux/amd64**. [Digest pin/bằng chứng](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.7
    platform: linux/amd64
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

Giữ volume/mount tại `DATA_DIR` hiệu lực: mặc định `/app/data` hoặc đường dẫn tùy chỉnh hỗ trợ. Volume trống không là di chuyển. Mirror Docker Hub tùy chọn. [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md).

## Ranh giới tin cậy

HTTPS có auth, firewall, body/timeouts hữu hạn, tắt SSE buffering. Proxy tin cậy phải thêm peer thật vào `X-Forwarded-For`, không chuyển nguyên đầu vào client. Không mở Headroom/MITM control ra Internet. `https://router.example.com/v1` chỉ là ví dụ tự triển khai. Dừng và backup toàn bộ, giữ đường dẫn/secret/chứng chỉ. [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) · [Vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md). Không xác nhận deploy/scan thành công.
