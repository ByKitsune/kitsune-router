# Triển khai localhost

Dashboard/API cùng cổng **20128**, không 3000. Nguồn 1.0.2 đã xác minh ở tag bất biến `65c8b97d`, xuất bản registry bị chặn. Dùng [mã nguồn](/vi/getting-started/installation/) với Node.js >=22.19.0 trước khi xác minh xuất bản/readback. Tag/test local không chứng minh registry sẵn có; chỉ sau đó chạy gói `kitsune-router`.

- Dashboard: `http://localhost:20128/dashboard`
- API: `http://localhost:20128/v1`
- Health: `http://localhost:20128/api/health`
- Dữ liệu: `~/.kitsune-router` hoặc `%APPDATA%\kitsune-router`

```bash
DATA_DIR=/absolute/private/path kitsune-router
```

`DATA_DIR` tường minh có ưu tiên, không di chuyển. Dừng bằng launcher hoặc `Ctrl+C`, không writer đồng thời/kill diện rộng. Backup toàn thư mục đã dừng: SQLite, secret, identity, auth, chứng chỉ. Không khôi phục đè lên trạng thái đang chạy hoặc mở quyền rộng.

Di chuyển kiểm tra/copy `~/.zenrouter`/`~/.9router` đã dừng, giữ bản gốc, không ghi đè đích. [Hướng dẫn](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md). Giữ salt và root tin cậy, đặt mật khẩu mạnh. Với nguồn dùng đường dẫn tuyệt đối và [vận hành](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)/`.env.example`, không chỉ dẫn Node 20/`db.json` cũ.
