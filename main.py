from os import path

import webview

from powermeter.api import Api

HERE = path.dirname(path.abspath(__file__))
INDEX_FILE = path.join(HERE, "web", "index.html")
ICON_FILE = path.join(HERE, "assets", "icon.png")
STORAGE_PATH = path.join(path.expanduser("~"), ".rf-power-meter-console")


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
    webview.start(api.start, icon=ICON_FILE, private_mode=False, storage_path=STORAGE_PATH)


if __name__ == "__main__":
    main()
