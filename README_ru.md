# RF Power Meter Console

<p align="center">
  <img src="img/device.jpg" alt="Устройство USB RF Power Meter v3" width="360">
</p>

Кроссплатформенное десктоп-приложение для USB RF Power Meter V3.0 100K To 10GHZ -55 To +30dBm Prestored 9 Attenuation Curves 0.96" Color Display. Работает на macOS, Windows и Linux.

<p align="center">
  <img src="img/GUI.gif" alt="Интерфейс RF Power Meter Console" width="720">
</p>

[Read in English](README.md)

## Возможности

- Текущие показания (dBm / мощность) со скользящим графиком за 60 секунд и
  отслеживанием мин/макс
- 9 слотов конфигурации (частота + оффсет), выбор карточки переключает
  активный слот на устройстве, редактирование — через попап по значку
  карандаша
- Переключатель скорости опроса (L / M / H)
- Журнал команд, отправленных на устройство и полученных от него
- Запись: захват показаний в CSV (с активным слотом, частотой и оффсетом
  в каждой строке), затем открытие CSV в отдельном полноэкранном режиме
  анализа с тултипом при наведении и горизонтальной прокруткой графика
- Тёмная / светлая темы, интерфейс на русском / английском
- Выбор последовательного порта с ручным обновлением списка

## Запуск на Linux

В релизе — `.deb` для Debian/Ubuntu и производных. Ставьте через apt, он
сам подтянет зависимости GTK/WebKit:

```bash
sudo apt install ./RFPowerMeterConsole-linux.deb
```

Это не замороженный бинарник — GTK/WebKit-биндинги (`gi`), которые нужны
pywebview на Linux, есть только в системном Python, поэтому пакет
запускает приложение через системный `python3`.

## Разработка

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python3 main.py
```

`requirements-dev.txt` дополнительно ставит PyInstaller для локальной сборки;
для запуска приложения достаточно `requirements.txt`.

## Сборка standalone-бинарника (macOS / Windows)

```bash
.venv/bin/pyinstaller --noconfirm --clean --name RFPowerMeterConsole \
  --windowed --icon assets/icon.icns \
  --add-data "web:web" --add-data "assets:assets" main.py   # macOS
```

На Windows используйте `--icon assets\icon.ico` и `--add-data "web;web"
--add-data "assets;assets"` (разделитель — точка с запятой), а также
добавьте `--onefile`, если нужен единый `.exe`.

Результат сборки попадает в `dist/`.

Linux не собирается через PyInstaller — GTK/WebKit-биндинги pywebview
живут в системном Python, замороженный бинарник их с собой не унесёт,
поэтому в релизе исходники пакуются прямо в `.deb`, который запускается
через системный `python3` (см. `.github/workflows/build.yml`).

## Релизы

Пуш тега вида `v*.*.*` запускает `.github/workflows/build.yml`, который
собирает приложение под macOS, Windows и Linux и открывает
**черновик** GitHub-релиза с приложенными артефактами сборки. Ничего не
публикуется автоматически — черновик нужно проверить и опубликовать вручную
на странице Releases репозитория.

```bash
git tag v0.1.0
git push origin v0.1.0
```

Также можно запустить сборку без релиза через кнопку "Run workflow"
(`workflow_dispatch`) — артефакты сборки при этом всё равно создаются, а
релиз — только при пуше тега.

## Протокол устройства

Описание реверс-инжиниренного протокола (скорость порта, форматы команд,
таймауты) — в [`PROTOCOL.md`](PROTOCOL.md).
