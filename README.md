# Lab Inventory System — Модуль 1: Backend + БД

Система учёта расходных материалов лаборатории без кладовщика. Ядро: FastAPI + PostgreSQL 15.

## Быстрый старт (одна команда)

```bash
cp .env.example .env          # при желании заполните JWT_SECRET и GOOGLE_CLIENT_ID
docker compose up -d --build
```

После запуска:
- API: http://localhost:8000
- Swagger: http://localhost:8000/docs
- БД автоматически мигрируется (Alembic) и заполняется демо-данными (2 гранта, админ `admin@lab.test`, 5 товаров, 4 упаковки).

Проверка: `curl http://localhost:8000/api/v1/health`

## Запуск тестов

Нужен запущенный PostgreSQL (тестовая БД `lab_test` создаётся автоматически при первом старте контейнера `db`):

```bash
docker compose up -d db
cd backend
pip install -r requirements.txt
pytest -v
```

Тесты используют реальные Alembic-миграции и ~45 сценариев: авторизация (включая подпись Telegram initData), коды номенклатуры (проверка MOD-10), упаковки/перемещение/вскрытие/резервы/списание, приёмка заявок с разбиением на упаковки, нечёткий поиск, связка аккаунтов, отчёты по грантам, планировщик.

## Авторизация

| Способ | Как |
|---|---|
| Google (прод) | PWA получает ID-токен Google → `POST /api/v1/auth/google {"credential": "<id_token>"}` |
| Dev-режим | `DEV_MODE=true` → `credential = "dev:email@example.com"` (только для разработки!) |
| Бот | `POST /api/v1/auth/telegram` — по подписанному `init_data` либо по `telegram_id` + заголовок `X-Bot-Secret` |
| Продление | `POST /api/v1/auth/refresh` (access живёт 1 час, refresh — 30 дней) |

Роли: первый вход создаёт пользователя `user`; админы назначаются через `GOOGLE_ADMIN_EMAILS`.

## Ключевые переменные окружения

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `DATABASE_URL` | строка подключения (asyncpg) | `postgresql+asyncpg://lab:lab@localhost:5432/lab` |
| `JWT_SECRET` | секрет JWT — **обязательно сменить в проде** | предупреждение в логах |
| `DEV_MODE` | dev-вход без Google | `false` |
| `GOOGLE_CLIENT_ID` | OAuth-клиент Google | пусто |
| `GOOGLE_ADMIN_EMAILS` | e-mail'ы админов через запятую | `admin@lab.test` |
| `BOT_TOKEN` | токен Telegram-бота (проверка initData) | пусто |
| `INTERNAL_API_SECRET` | общий секрет backend↔bot | — |
| `TELEGRAM_BOT_WEBHOOK_URL` | куда слать уведомления | `http://telegram-bot:8080/bot/webhook` |
| `SCHEDULER_ENABLED` | планировщик | `true` |
| `SEED_ADMIN_EMAIL` | e-mail админа в демо-данных | `admin@lab.test` |

## Обзор API (префикс `/api/v1`)

- `/auth/google`, `/auth/telegram`, `/auth/refresh`
- `/nomenclature` — CRUD (создание/изменение только админ, изменения в `audit_log`)
- `/packages` — список/детали/создание, `/location` (перемещение), `/open` (вскрытие), `/reserve` + `DELETE /reserve`, `/write-off`
- `/transactions` — история движений с фильтрами
- `/users/me`, `/users/link-code` (6-значный код, 10 минут), `/users/link-telegram`, `/users/frequent`
- `/grants` — список/создание/изменение
- `/purchase-orders` — заявки, `/receive` (приёмка с разбиением на упаковки), `/cancel`
- `/search?q=` — нечёткий поиск (FTS английский + триграммы + CAS)
- `/reports/grants/{id}/consumption` — расход по гранту за период
- `/health`

## Бизнес-логика (ТЗ 1.4)

- **Резервы**: снимаются автоматически каждые 5 минут; за ≤5 минут до истечения — уведомление `reserve_expiring`.
- **Низкий остаток**: при списании, если суммарный остаток < `min_stock` — создаётся одна авто-заявка и уходит уведомление `low_stock` админам.
- **Сроки годности**: ежедневно в 06:00 UTC — `expiry_warning_30d` (за 30 дней) и `package_expired` (в день истечения) админам. Просрочка при сканировании не блокирует работу — только отображается.
- **Неразмещённые**: упаковки `pending` старше 48 ч — уведомление `pending_placement` создавшему сотруднику (раз в сутки).
- **Просроченные поставки**: `purchase_order_due` админам и автору заявки.

Формат уведомления для бота: `{ "event": ..., "recipient_telegram_ids": [...], "payload": {...} }` с заголовком `X-Webhook-Secret`.

## Принятые решения и отклонения от ТЗ

1. **Коды номенклатуры** генерируются автоматически при создании карточки: внутренний диапазон GS1 (префикс `200`), 14 цифр с контрольной цифрой MOD-10. GTIN лаборатории не требуется.
2. **Содержимое DataMatrix** формируется бэкендом детерминированно `(01)...(10)...(15)...(21)...` — без вызова генератора кодов при создании упаковки (сервис генератора нужен только для рендера/печати).
3. Добавлены поля: `nomenclature.nomenclature_code`, `transactions.grant_id` (для отчётов по грантам), `packages.created_by_id` (для уведомлений о неразмещённом).
4. Добавлены таблицы/эндпоинты: `account_link_codes`, `/auth/refresh`, `/users/link-code`, `/purchase-orders/{id}/cancel`, `/grants/{id}` (PUT), `/reports/...`.
5. Авторизация бота: подписанный `initData` либо `telegram_id` + общий секрет (эндпоинт только для нашего бота).
6. Поиск английский (`to_tsvector('english', ...)`) + `pg_trgm` — лаборатория международная, кириллица не нужна.
7. Все времена в БД — UTC; клиенты отображают в локальном часовом поясе.
8. Заказанные, но не доставленные товары — только в `purchase_orders`; упаковки создаются при приёмке.
9. Просмотр остатков доступен всем сотрудникам; регистрация/приёмка/админка — только админам.
10. Бэкапы: контейнер `db-backup`, ежедневно, хранение 14 дней.

## Стек

FastAPI · SQLAlchemy 2.0 (async, asyncpg) · Alembic · PyJWT · google-auth · APScheduler · pytest + pytest-asyncio · Docker Compose