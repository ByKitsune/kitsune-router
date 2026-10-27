# VPS và container

Remote là gateway **do bạn quản lý**, không endpoint hosted đi kèm. Localhost là máy gửi request. Không cần ByKitsune hay thứ tự provider bắt buộc.

## Dịch vụ nguồn

Node.js >=22.19.0, dependency khóa, build từ root theo [cài đặt](/vi/getting-started/installation/). Service manager dùng `DATA_DIR` tuyệt đối riêng tư, secret ổn định và mật khẩu mạnh; không commit key vào unit/image.

## Container

**Nguồn 1.0.2 đã xác minh ở `65c8b97d`; xuất bản GHCR bị chặn.** Run `40469972099` qua gate/login rồi preflight phân loại sai manifest thiếu, dừng trước build/push. Readback xác thực HTTP 404 / `MANIFEST_UNKNOWN`. Recovery riêng giữ nguồn/phiên bản/tag, chưa có image chính thức. Ví dụ chỉ dùng sau xác minh digest/provenance/SBOM/readback. Chỉ linux/amd64; test khởi động lại local không chứng minh image công khai.

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.2
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
