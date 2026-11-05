# VPS 与容器部署

远程 Kitsune Router 是**你管理的**网关，不包含默认托管端点。localhost 指请求所在机器。无需 ByKitsune 账户或固定提供商顺序。

## 源码服务

使用 Node.js >=22.19.0、锁定依赖和根目录构建流程，见 [安装](/zh-CN/getting-started/installation/)。服务管理器应使用绝对私密 `DATA_DIR`、稳定密钥与强 `INITIAL_PASSWORD`，不把秘密提交到 unit 文件或示例镜像。

## 容器

**当前容器目标为 `ghcr.io/bykitsune/kitsune-router:1.0.8`，平台仅为 linux/amd64。** 以下示例仅在 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)确认该镜像已发布、读回通过且具有所需访问权限后适用。认证拉取成功不代表可匿名拉取。1.0.8 应使用该记录中的实际摘要，不得复用下方历史 1.0.2 摘要。

**发布历史与修复准备：** 1.0.7 已从不可变源码 `b7f77d07` 发布到 npm、GHCR 和 GitHub Release，但存在顺序执行 `--no-save` 安装时 SQLite/tray 相互裁剪的已知问题。1.0.8 尚未发布，正在等待精确源码 CI 与常规安装候选验证；各渠道的实际结果与已知问题以 [发布验证记录](https://github.com/ByKitsune/kitsune-router/blob/master/docs/audit/33-1.0.6-publication-and-registry-verification-2026-11-05.md)为准。

**1.0.2 历史记录（当时的验证结果）：** **GHCR 1.0.2 已发布，但为 private。** Recovery `40485038668` 用 tooling `802c61bf` 构建不可变 runtime `65c8b97d`，认证摘要/来源/SPDX 读回及已发布镜像 smoke 通过。`1.0.2`/`latest` 共用索引 `sha256:7abd76eee998d516020cbe015e6989394085dbfc7c330559e945a2c21494d45b`。下列示例须获授权私有 GHCR 访问，或先确认所有者完成 Public 设置且匿名读回成功。Public 选择未确认，最近匿名 grant HTTP 401。仅 **linux/amd64**。见 [摘要锁定与证据](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)。

### 1.0.8 配置示例（GHCR 确认后）

```yaml
services:
  kitsune-router:
    image: ghcr.io/bykitsune/kitsune-router:1.0.8
    platform: linux/amd64
    ports:
      - "127.0.0.1:20128:20128"
    volumes:
      - ./data:/app/data
    environment:
      DATA_DIR: /app/data
      INITIAL_PASSWORD: ${INITIAL_PASSWORD:?Set a strong dashboard password}
```

在有效 `DATA_DIR` 保留旧卷/挂载：默认 `/app/data`，支持的自定义路径也保留，不以新空卷冒充迁移。不得据此推断 Docker Hub 镜像已发布。见 [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)。

## 安全边界

使用认证 HTTPS、防火墙、受限请求体/超时，关闭 SSE 缓冲。受信任本地代理须向 `X-Forwarded-For` 追加实际对端，而非原样转发客户端输入。不要公开 Headroom/MITM 控制 API。`https://router.example.com/v1` 只是自建服务占位符。停止后整目录备份，保留显式路径、秘密与证书，见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) 和 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。此文不证明部署/扫描成功。
