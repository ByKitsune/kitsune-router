# Kitsune Router

**Your models. Your routes.**

Локальный AI-шлюз с нейтральным отношением к провайдерам; поддержка и спонсорство — [ByKitsune](https://bykitsune.com). Вы выбираете модели, аккаунты и порядок переключения. Аккаунт ByKitsune и покупка облачного API не требуются. Запросы всё равно уходят настроенным провайдерам: local-first не означает офлайн-инференс.

[English](../README.md) · [Репозиторий](https://github.com/ByKitsune/kitsune-router) · [Изменения](../CHANGELOG.md) · [Миграция](../docs/MIGRATION.md)

## Статус и установка

**1.0.0 — предлагаемый первый несовместимый релиз после ребрендинга; проверка и публикация ещё не завершены.** Нужно подтвердить регистрацию/владение пространствами имён, права npm, доступ к реестрам и артефакты. Цели: `ByKitsune/kitsune-router`, пакет `@bykitsune/router`, команда `kitsune-router`, основной образ `ghcr.io/bykitsune/kitsune-router`. Архивы 0.x сохраняют исходные артефакты ZenRouter и не обозначают прошлые публикации Kitsune.

Требуется **Node.js >=22.19.0**. Только после публикации:

```bash
npm install -g @bykitsune/router@1.0.0
kitsune-router
# Или: npx @bykitsune/router@1.0.0
```

Из исходников, в корне без подкаталога `app/` (если новый репозиторий недоступен, используйте имеющийся checkout):

Только для **новой** установки один раз создайте секрет в закрытом `.env` (POSIX shell/OpenSSL). `next dev` не запускает генератор launcher; без случайного `JWT_SECRET` не короче 32 символов вход не работает. При миграции сохраните действующие `JWT_SECRET`, `API_KEY_SECRET`, `MACHINE_ID_SALT` и абсолютный `DATA_DIR`. Проверьте файл; заменяйте примерные значения только в новой установке, не публикуйте и не коммитьте `.env`.

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

До открытия доступа задайте надёжный `INITIAL_PASSWORD`. Откройте `http://localhost:20128/dashboard`, подключите разрешённого провайдера и создайте/скопируйте ключ шлюза. Базовый URL клиента: `http://localhost:20128/v1`. Выбирайте модель из реального списка; `/api/health` не подтверждает доступ к upstream.

## Интеграция

Исполняемая команда — **`kitsune-router`**, ключ провайдера — **`kitsunerouter`**. Codex использует `~/.codex/config.toml`:

```toml
model_provider = "kitsunerouter"
model = "my-route"

[model_providers.kitsunerouter]
name = "Kitsune Router"
base_url = "http://localhost:20128/v1"
wire_api = "responses"
env_key = "KITSUNE_ROUTER_API_KEY"
```

Сначала создайте пример combo `my-route`. Переменная содержит выданный ключ, а не создаёт его. Для Claude Code задайте `ANTHROPIC_BASE_URL=http://localhost:20128`: клиент добавляет `/v1/messages`. Проверяйте пресеты и сохраняйте остальные настройки. [Полные примеры](../docs/INTEGRATIONS.md).

## Миграция и безопасность

Остановите старый шлюз и вспомогательные процессы, сохраните **весь** закрытый каталог данных. При запуске возможна проверенная миграция `~/.zenrouter` или `~/.9router` в `~/.kitsune-router` (аналоги в `%APPDATA%` для Windows) с согласованным SQLite-снимком и проверкой файлов. Исходники сохраняются, существующая цель не перезаписывается. Явный `DATA_DIR` имеет приоритет и не переносится.

Сохраните `db/data.sqlite`, `secrets.json`, `machine-id`, `auth/`, `mitm/`. Не меняйте криптографические соли и доверенные корневые сертификаты ради переименования. Шифрование всех ключей при хранении не гарантируется. Новые настройки: `KITSUNE_ROUTER_*`; заголовки: `x-kitsune-router-*`; провайдер: `kitsunerouter`. `/v1/*` и порт 20128 остаются; псевдонимы старой команды/ключа не обязательны.

Docker сохраняет прежний том в `/app/data`; публикация только linux/amd64. Проверьте основной образ; зеркало Docker Hub необязательно. [Установка](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Эксплуатация](../docs/OPERATIONS.md).

Сжатие зависит от нагрузки: нет гарантированного процента экономии, безлимитной квоты или непрерывной работы. Оценки — не счета; неизвестная цена не равна нулю. Права аккаунта, регионы и условия провайдера сохраняют силу. Готового облачного сервиса Kitsune нет; старая синхронизация удалена. Эта правка документации не подтверждает текущие тесты/сборку. [Черновик 1.0.0](../releases/RELEASE_NOTES_v1.0.0.md).

## Благодарности и лицензия

Спасибо авторам и участникам ZenRouter/9Router, включая Joy, а также [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman), [Ponytail](https://github.com/DietrichGebert/ponytail). Авторские уведомления и историческое происхождение сохраняются. MIT: [LICENSE](../LICENSE).
