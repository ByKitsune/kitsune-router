# Kitsune Router

**Your models. Your routes.**

Gateway de IA local-first e neutro entre provedores, mantido e patrocinado pela [ByKitsune](https://bykitsune.com). Você escolhe modelos, contas e ordem de fallback. Não exige conta ByKitsune nem compra de API hospedada. As requisições ainda chegam aos provedores configurados; local-first não significa inferência offline.

[English](../README.md) · [Repositório](https://github.com/ByKitsune/kitsune-router) · [Mudanças](../CHANGELOG.md) · [Migração](../docs/MIGRATION.md)

## Publicação e instalação

**Fonte 1.0.2 verificada; publicação npm/GHCR bloqueada.** Tag imutável `65c8b97d`: 9.041 aprovados, 100 ignorados, zero falhas de testes/suites; lint estrito e builds app/docs passaram. npm publish recebeu E403 (2FA ou token granular com bypass 2fa); leitura pública HTTP 404. GHCR passou verificações/login, mas preflight parou antes de build/push por classificar mal um manifest ausente. O usuário substituirá o token no GitHub UI, ainda sem confirmação; recuperação separada não muda versão/tag. Sem artefato público ou GitHub Release estabelecidos. Pacote `@bykitsune/router`, comando `kitsune-router`; use comandos após publicação verificada ou fontes agora. [Estado 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

Os tags ficam imutáveis: `v1.0.1` em `74583402` passou SSH/CI, mas a verificação GHCR falhou antes de login/push, sem imagem canônica. npm publish falhou por causa ainda desconhecida; leitura pública HTTP 404 em 2026-10-27, sem GitHub Release. `v1.0.0` em `390a6567` não publicou npm/GHCR após falha no teste de migração. [Tentativa 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md) · [Candidata 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md). O relógio de teste e os diagnósticos npm não mudam a ordem nem a política fail-closed em produção. Contagens antigas não verificam 1.0.2; histórico 0.x preservado.

Requer **Node.js >=22.19.0**. Somente após a publicação:

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# Ou: npx @bykitsune/router@1.0.2
```

Pelo repositório canônico confirmado ou checkout existente, na raiz sem subdiretório `app/`:

Somente em instalação **nova**, gere o segredo uma vez no `.env` privado (shell POSIX/OpenSSL). `next dev` não executa o gerador do launcher; sem `JWT_SECRET` aleatório com pelo menos 32 caracteres o login falha. Na migração preserve `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` efetivos e `DATA_DIR` absoluto. Revise o arquivo, substitua valores de exemplo apenas em instalação nova e nunca publique/commite `.env`.

```bash
git clone https://github.com/ByKitsune/kitsune-router.git
cd kitsune-router
umask 077
cp -n .env.example .env
if ! grep -q '^JWT_SECRET=.' .env; then
  printf '\nJWT_SECRET=%s\n' "$(openssl rand -hex 32)" >> .env
fi
chmod 600 .env
npm ci
npm run check:deps
PORT=20128 NEXT_PUBLIC_BASE_URL=http://localhost:20128 npm run dev
```

Defina um `INITIAL_PASSWORD` forte antes de expor o serviço. Abra `http://localhost:20128/dashboard`, conecte um provedor autorizado e crie/copie uma chave do gateway. Base do cliente: `http://localhost:20128/v1`. Escolha um modelo realmente listado; `/api/health` não comprova acesso ao provedor.

## Integração

O executável é **`kitsune-router`**; o identificador de provedor é **`kitsunerouter`**. Codex usa `~/.codex/config.toml`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Crie o combo de exemplo `my-route` primeiro. A variável contém uma chave emitida, não cria uma. Claude Code usa `ANTHROPIC_BASE_URL=http://localhost:20128` e acrescenta `/v1/messages`. Revise presets preservando outras configurações. [Exemplos completos](../docs/INTEGRATIONS.md).

## Migração e segurança

Pare o gateway anterior e auxiliares e faça backup de **todo** o diretório privado. A inicialização pode migrar `~/.zenrouter` ou `~/.9router` para `~/.kitsune-router` (equivalentes em `%APPDATA%` no Windows), verificando snapshot SQLite consistente e arquivos copiados. Os originais permanecem; destinos existentes não são sobrescritos. `DATA_DIR` explícito é autoritativo e não muda de lugar.

Preserve `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/` e `mitm/`. Não altere sais criptográficos nem raízes de certificados confiáveis apenas pelo nome. Nem toda credencial tem garantia de criptografia em repouso. Variáveis novas: `KITSUNE_ROUTER_*`; cabeçalhos: `x-kitsune-router-*`; provedor: `kitsunerouter`. `/v1/*` e porta 20128 continuam iguais; aliases antigos não são exigidos.

Docker mantém volume/montagem no `DATA_DIR` efetivo: `/app/data` padrão ou caminho absoluto personalizado suportado; apenas linux/amd64. Em Linux restrito, pare/faça backup e mantenha o estado com `DATA_DIR` explícito sem mover, ou peça revisão privilegiada; não ignore permissões. Verifique a imagem; espelho opcional. [Instalação](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Operação](../docs/OPERATIONS.md).

Compressão depende da carga: não há economia fixa, cota ilimitada ou disponibilidade garantida. Estimativas não são faturas; preço desconhecido não é zero. Permissões, regiões e termos dos provedores continuam válidos. Não há serviço Kitsune hospedado padrão; a sincronização antiga foi removida. Testes de fonte/artefatos locais não comprovam publicação. [Evidências 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

## Créditos e licença

Agradecemos aos autores e colaboradores de ZenRouter/9Router, incluindo Joy, e a [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman) e [Ponytail](https://github.com/DietrichGebert/ponytail). Avisos de copyright e procedência histórica são preservados. MIT: [LICENSE](../LICENSE).
