import sys
from os import path

import webview

from powermeter.api import Api

# В frozen-сборке ресурсы лежат в распакованном каталоге PyInstaller, а не рядом
# с исходником. Полагаться на __file__ нельзя: он меняется между onefile/onedir
# и между версиями PyInstaller.
HERE = getattr(sys, "_MEIPASS", path.dirname(path.abspath(__file__)))
INDEX_FILE = path.join(HERE, "web", "index.html")
ICON_FILE = path.join(HERE, "assets", "icon.ico" if sys.platform == "win32" else "icon.png")
STORAGE_PATH = path.join(path.expanduser("~"), ".rf-power-meter-console")
# Persistent pywebview apps otherwise share http://127.0.0.1:42001.
# Use an app-specific origin to isolate cached pages and browser storage.
HTTP_PORT = 42673

# Автодетект бэкенда в frozen-сборке видит не то же, что на dev-машине.
# Фиксируем явно, чтобы поведение совпадало на всех трёх платформах.
if sys.platform == "win32":
    GUI_BACKEND = "edgechromium"
elif sys.platform == "darwin":
    GUI_BACKEND = "cocoa"
else:
    GUI_BACKEND = "gtk"


def selftest() -> int:
    """Проверка собранного артефакта без открытия окна.

    Ловит ровно те поломки, которые иначе всплывают только у пользователя:
    потерянные data-файлы, необнаруженный бэкенд pywebview, отсутствующий
    драйвер последовательного порта. Отчёт дублируется в selftest.log, потому
    что windowed-сборка на Windows не имеет консоли.
    """
    problems = []
    notes = []

    for label, target in (("web/index.html", INDEX_FILE), ("icon", ICON_FILE)):
        if path.isfile(target):
            notes.append(f"ok   resource {label}: {target}")
        else:
            problems.append(f"FAIL resource {label} not found: {target}")

    webview_js = path.join(path.dirname(path.abspath(webview.__file__)), "js")
    if path.isdir(webview_js):
        notes.append(f"ok   pywebview js assets: {webview_js}")
    else:
        problems.append(f"FAIL pywebview js assets missing: {webview_js} (нужен --collect-all webview)")

    # edgechromium alone does not initialize Python.NET. The Windows GUI
    # starts through winforms, which imports clr and loads Python.Runtime.dll.
    backend_modules = [GUI_BACKEND]
    if sys.platform == "win32":
        backend_modules.insert(0, "winforms")
    for backend in backend_modules:
        try:
            __import__(f"webview.platforms.{backend}")
            notes.append(f"ok   gui backend importable: {backend}")
        except Exception as exc:  # noqa: BLE001 - интересует любой сбой импорта
            problems.append(f"FAIL gui backend '{backend}' not importable: {exc!r}")

    try:
        from powermeter.ports import list_serial_ports

        notes.append(f"ok   serial enumeration: {len(list_serial_ports())} port(s)")
    except Exception as exc:  # noqa: BLE001
        problems.append(f"FAIL serial enumeration: {exc!r}")

    try:
        Api()
        notes.append("ok   Api() constructed")
    except Exception as exc:  # noqa: BLE001
        problems.append(f"FAIL Api() construction: {exc!r}")

    report = "\n".join(
        [f"selftest on {sys.platform}, frozen={getattr(sys, 'frozen', False)}", *notes, *problems]
    )
    print(report)
    try:
        with open("selftest.log", "w", encoding="utf-8") as handle:
            handle.write(report + "\n")
    except OSError:
        pass

    return 1 if problems else 0


def main() -> None:
    api = Api()
    window = webview.create_window(
        "RF Power Meter Console",
        INDEX_FILE,
        js_api=api,
        width=1180,
        height=760,
        min_size=(760, 480),
        background_color="#14181f",
    )
    api.set_window(window)
    window.events.closed += api.stop
    webview.start(
        api.start,
        gui=GUI_BACKEND,
        icon=ICON_FILE,
        private_mode=False,
        storage_path=STORAGE_PATH,
        http_port=HTTP_PORT,
    )


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        raise SystemExit(selftest())
    main()
