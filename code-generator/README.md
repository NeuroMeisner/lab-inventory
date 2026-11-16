# Модуль 4: Генератор кодов и печать

Микросервис: DataMatrix для упаковок, QR для мест хранения, рендер этикеток 62×100 мм и печать на Brother QL.

## Запуск

В составе всего проекта:
```bash
docker compose up -d --build code-generator
```
- API: http://localhost:8001
- Swagger: http://localhost:8001/docs

Локально без Docker (нужна системная библиотека libdmtx и шрифты):
```bash
# Ubuntu/Debian:
sudo apt install libdmtx0a fonts-dejavu-core
# macOS:
brew install libdmtx

cd code-generator
pip install -r requirements.txt
uvicorn app.main:create_app --factory --reload --port 8001
```

## Тесты

```bash
# Вариант 1 — в контейнере (рекомендуется, все зависимости внутри):
docker compose run --rm code-generator pytest -v

# Вариант 2 — локально (после установки libdmtx):
cd code-generator && pytest -v
```

Тесты проверяют в т.ч. **раскодирование** сгенерированного DataMatrix (round-trip через pylibdmtx) — то есть коды реально считываются сканером.

## Эндпоинты

| Эндпоинт | Описание |
|---|---|
| `POST /generate/datamatrix` | PNG DataMatrix 30×30 мм (300 DPI). Принимает готовую `content`-строку или поля `nomenclature_code/batch_number/expiry_date/package_id` |
| `POST /generate/qr` | PNG QR 40×40 мм, содержимое `LOC:<location>` |
| `POST /render/package-label` | Полная этикетка 62×100 мм (макет ТЗ 4.2.3) |
| `POST /render/location-label` | Этикетка места хранения: QR 40×40 мм + адрес + описание |
| `POST /print` | Рендер + печать. `label_type: package | location`, `copies`, `printer_ip` или `printer_address` |
| `GET /printers` | Конфигурация и список поддерживаемых моделей |
| `GET /health` | Работоспособность |

Если задан `INTERNAL_API_SECRET`, все запросы должны содержать заголовок `X-Internal-Secret`.

## Настройка принтера (когда будет куплен)

1. Модель и адрес — в `.env`:
   ```bash
   PRINTER_MODEL=QL-800                # или QL-810W / QL-820NWB
   PRINTER_ADDRESS=tcp://192.168.1.100:9100   # сеть
   # или PRINTER_ADDRESS=usb://0x04f9:0x209e  # USB (видно в /printers при подключении)
   LABEL_SIZE=62x100                   # предвысеченные этикетки Brother DK-11202
   ```
2. До покупки принтера можно включить `PRINTER_DRY_RUN=true` — сервис рендерит этикетки и рапортует об успехе без отправки на печать.
3. Финальная проверка печати на реальном принтере — отдельный шаг приёмки.

## Принятые решения / отклонения от ТЗ

1. **Содержимое DataMatrix** детерминированно собирается из полей (идентично бэкенду Модуля 1). Бэкенд не вызывает генератор при создании упаковки — только при рендере/печати (меньше точек отказа).
2. **Печать в v1 вызывается напрямую** из PWA/админки (`POST /print`), без прокси через бэкенд. Флаг `label_printed` при необходимости обновляется отдельным вызовом.
3. **Принтер не выбран** — конфигурация через переменные окружения; по умолчанию QL-800 + DK-11202 (62×100 мм, предвысеченная).
4. **Язык этикеток — английский** (шрифт DejaVu поддерживает и кириллицу на будущее).
5. `expiry_date` принимается в `ГГММДД` и в `YYYY-MM-DD`.