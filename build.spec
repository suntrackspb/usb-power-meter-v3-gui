# -*- mode: python ; coding: utf-8 -*-
"""Единая спецификация сборки для macOS и Windows.

Linux собирается не через PyInstaller, а в .deb поверх системного python3
(см. .github/workflows/build.yml), потому что PyGObject/WebKit2 практически
не переносимы в frozen-бандле.

Запуск:  pyinstaller --noconfirm --clean build.spec
"""

import sys

from PyInstaller.utils.hooks import collect_all, copy_metadata

APP_NAME = "RFPowerMeterConsole"
BUNDLE_ID = "com.rfpowermeter.console"

datas = [("web", "web"), ("assets", "assets")]
binaries = []
hiddenimports = []


def _collect(package):
    """Забрать пакет целиком: data-файлы, бинарники и динамические импорты."""
    global datas, binaries, hiddenimports
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(package)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden


# pywebview грузит бэкенды динамически и везёт свои webview/js/*.js —
# без collect_all анализатор PyInstaller их не видит и сборка падает в рантайме.
_collect("webview")
datas += copy_metadata("pywebview")

if sys.platform == "win32":
    # WebView2 через pythonnet: нативные DLL + рантайм-конфиг.
    _collect("clr_loader")
    _collect("pythonnet")
    hiddenimports += [
        "webview.platforms.edgechromium",
        "webview.platforms.winforms",
    ]
    icon = "assets/icon.ico"
elif sys.platform == "darwin":
    hiddenimports += ["webview.platforms.cocoa"]
    icon = "assets/icon.icns"
else:
    hiddenimports += ["webview.platforms.gtk"]
    icon = None

hiddenimports += ["serial.tools.list_ports"]

a = Analysis(
    ["main.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib", "numpy", "PIL", "PySide6", "PyQt5", "PyQt6"],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name=APP_NAME,
)

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name=f"{APP_NAME}.app",
        icon=icon,
        bundle_identifier=BUNDLE_ID,
        info_plist={
            "CFBundleName": "RF Power Meter Console",
            "CFBundleDisplayName": "RF Power Meter Console",
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            "LSApplicationCategoryType": "public.app-category.utilities",
        },
    )
