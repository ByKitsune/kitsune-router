# VPS và container

Remote là gateway **do bạn quản lý**, không endpoint hosted đi kèm. Localhost là máy gửi request. Không cần ByKitsune hay thứ tự provider bắt buộc.

## Dịch vụ nguồn

Node.js >=22.19.0, dependency khóa, build từ root theo [cài đặt](/vi/getting-started/installation/). Service manager dùng `DATA_DIR` tuyệt đối riêng tư, secret ổn định và mật khẩu mạnh; không commit key vào unit/image.

## Container

**1.0.2 chờ SHA/tag cuối, gate và xuất bản**. Hai lần thử cũ không có image GHCR chính thức: 1.0.1 lỗi trước login/push, 1.0.0 lỗi test di chuyển. Kiểm tra truy cập, digest và readback; tag/login không chứng minh xuất bản. Chỉ linux/amd64.

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
