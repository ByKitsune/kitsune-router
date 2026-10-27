# Kitsune Router

**Your models. Your routes.**

Локальный AI-шлюз с нейтральным отношением к провайдерам; поддержка и спонсорство — [ByKitsune](https://bykitsune.com). Вы выбираете модели, аккаунты и порядок переключения. Аккаунт ByKitsune и покупка облачного API не требуются. Запросы всё равно уходят настроенным провайдерам: local-first не означает офлайн-инференс.

[English](../README.md) · [Репозиторий](https://github.com/ByKitsune/kitsune-router) · [Изменения](../CHANGELOG.md) · [Миграция](../docs/MIGRATION.md)

## Статус и установка

**Исходный код 1.0.2 проверен; публикация npm/GHCR заблокирована.** Неизменяемый тег `65c8b97d`: 9 041 пройден, 100 пропущены, ноль ошибок assertion/suite; строгий lint и сборки app/docs успешны. npm publish отклонён с E403 (нужны 2FA либо granular token с bypass 2fa), публичное чтение HTTP 404. GHCR прошёл gate/login, но preflight ошибочно классифицировал отсутствующий manifest и остановился до build/push. Пользователь заменит token через GitHub UI, завершение не подтверждено; отдельное восстановление не меняет версию/тег. Публичный пакет, канонический образ и GitHub Release не установлены. Пакет `@bykitsune/router`, команда `kitsune-router`; используйте после подтверждения публикации, пока — исходный код. [Статус 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

Теги неизменяемы: `v1.0.1` на `74583402` прошёл SSH/CI, но проверка GHCR упала до login/push, канонический образ не опубликован. npm publish завершился ошибкой с пока неизвестной причиной; публичное чтение дало HTTP 404 2026-10-27, GitHub Release не создан. `v1.0.0` на `390a6567` не публиковал npm/GHCR после сбоя теста миграции. [Попытка 1.0.1](../releases/RELEASE_NOTES_v1.0.1.md) · [Кандидат 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md). Тестовые часы и диагностика npm не меняют производственную сортировку и fail-closed проверку владения. Старые результаты не проверяют 1.0.2; история 0.x сохранена.

Требуется **Node.js >=22.19.0**. Только после публикации:

```bash
npm install -g @bykitsune/router@1.0.2
kitsune-router
# Или: npx @bykitsune/router@1.0.2
```

Из подтверждённого основного репозитория или имеющегося checkout, в корне без подкаталога `app/`:

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

Docker сохраняет том/mount по эффективному `DATA_DIR`: `/app/data` по умолчанию либо поддерживаемый свой абсолютный путь; только linux/amd64. В ограниченном Linux остановите/сохраните источник и используйте явный `DATA_DIR` без переноса либо запросите привилегированную проверку; не игнорируйте permission errors. Проверьте образ, зеркало необязательно. [Установка](../docs/INSTALLATION.md) · [Docker](../DOCKER.md) · [Эксплуатация](../docs/OPERATIONS.md).

Сжатие зависит от нагрузки: нет гарантированного процента экономии, безлимитной квоты или непрерывной работы. Оценки — не счета; неизвестная цена не равна нулю. Права аккаунта, регионы и условия провайдера сохраняют силу. Готового облачного сервиса Kitsune нет; старая синхронизация удалена. Проверки исходного кода и локальных артефактов не доказывают публикацию в registry. [Свидетельства 1.0.2](../releases/RELEASE_NOTES_v1.0.2.md).

## Благодарности и лицензия

Спасибо авторам и участникам ZenRouter/9Router, включая Joy, а также [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI), [RTK](https://github.com/rtk-ai/rtk), [Caveman](https://github.com/JuliusBrussee/caveman), [Ponytail](https://github.com/DietrichGebert/ponytail). Авторские уведомления и историческое происхождение сохраняются. MIT: [LICENSE](../LICENSE).
