# VPS 与容器部署

远程 Kitsune Router 是**你管理的**网关，不包含默认托管端点。localhost 指请求所在机器。无需 ByKitsune 账户或固定提供商顺序。

## 源码服务

使用 Node.js >=22.19.0、锁定依赖和根目录构建流程，见 [安装](/zh-CN/getting-started/installation/)。服务管理器应使用绝对私密 `DATA_DIR`、稳定密钥与强 `INITIAL_PASSWORD`，不把秘密提交到 unit 文件或示例镜像。

## 容器

**1.0.2 尚待最终 SHA/标签、验证门槛与发布**。两个旧尝试均未发布规范 GHCR 镜像：1.0.1 在登录/推送前门槛失败，1.0.0 迁移测试失败。先核实访问、摘要和读回；标签/登录不等于发布。仅 linux/amd64。

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

在有效 `DATA_DIR` 保留旧卷/挂载：默认 `/app/data`，支持的自定义路径也保留，不以新空卷冒充迁移。Docker Hub 镜像源可选。见 [Docker](https://github.com/ByKitsune/kitsune-router/blob/master/DOCKER.md)。

## 安全边界

使用认证 HTTPS、防火墙、受限请求体/超时，关闭 SSE 缓冲。受信任本地代理须向 `X-Forwarded-For` 追加实际对端，而非原样转发客户端输入。不要公开 Headroom/MITM 控制 API。`https://router.example.com/v1` 只是自建服务占位符。停止后整目录备份，保留显式路径、秘密与证书，见 [迁移](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md) 和 [运维](https://github.com/ByKitsune/kitsune-router/blob/master/docs/OPERATIONS.md)。此文不证明部署/扫描成功。
