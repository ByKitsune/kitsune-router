# Công cụ khác và SDK

OpenAI-compatible base `http://localhost:20128/v1`, khóa gateway đã cấp, model/combo thật sự bật. Provider **`kitsunerouter`**, không phải lệnh **`kitsune-router`**.

## Python

```python
import os
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:20128/v1",
    api_key=os.environ["KITSUNE_ROUTER_API_KEY"],
)
response = client.chat.completions.create(
    model=os.environ["KITSUNE_ROUTER_MODEL"],
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)
```

Đặt hai biến client riêng tư với key/route đã có, không refresh token. Biến không tạo key.

OpenCode cũ dùng `provider.kitsunerouter`, model `kitsunerouter/my-route`; V2 dùng `providers`/`package`/`settings`, không trộn schema. [Tham khảo](https://github.com/ByKitsune/kitsune-router/blob/master/docs/INTEGRATIONS.md) có JavaScript, Codex TOML và origin Claude Code.

Remote dùng HTTPS riêng, không endpoint hosted mặc định. Health `/api/health`, catalog `/v1/models`. Test không chứng minh quyền/billing; tôn trọng quota/cancel. [Khắc phục](/vi/troubleshooting/) · [Di chuyển](https://github.com/ByKitsune/kitsune-router/blob/master/docs/MIGRATION.md).
