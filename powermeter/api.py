import csv
import json
import threading
import time
from dataclasses import asdict
from typing import List, Optional

import webview

from . import protocol
from .ports import list_serial_ports
from .protocol import PowerReading, SlotConfig
from .worker import DeviceWorker

_UI_PUMP_INTERVAL_SECONDS = 1.0 / 30.0

CAPTURE_COLUMNS = (
    "timestamp",
    "slot_letter",
    "frequency_mhz",
    "offset_dbm",
    "current_dbm",
    "current_power",
    "current_unit",
    "min_dbm",
    "min_power",
    "min_unit",
    "max_dbm",
    "max_power",
    "max_unit",
)


class Api:
    def __init__(self):
        self._window: Optional[webview.Window] = None
        self._latest_reading: Optional[PowerReading] = None
        self._reading_lock = threading.Lock()
        self._pump_stop = threading.Event()
        self._pump_thread = threading.Thread(target=self._run_ui_pump, daemon=True)
        self._worker = DeviceWorker(
            on_power=self._handle_power,
            on_settings=self._handle_settings,
            on_log=self._handle_log,
            on_connection_changed=self._handle_connection_changed,
        )

    def set_window(self, window: webview.Window) -> None:
        self._window = window

    def start(self) -> None:
        self._worker.start()
        self._pump_thread.start()

    def stop(self) -> None:
        self._pump_stop.set()
        self._worker.stop()

    def list_ports(self) -> List[dict]:
        return [asdict(p) for p in list_serial_ports()]

    def connect(self, port: str) -> None:
        self._worker.connect(port)

    def disconnect(self) -> None:
        self._worker.disconnect()

    def write_slot(self, slot_index: int, frequency_mhz: int, offset_dbm: float) -> None:
        self._worker.write_slot(int(slot_index), int(frequency_mhz), float(offset_dbm))

    def set_sample_rate(self, level: int) -> None:
        self._worker.set_sample_rate(int(level))

    def request_settings(self) -> None:
        self._worker.request_settings()

    def export_csv(self, rows: List[dict]) -> Optional[str]:
        if self._window is None:
            return None
        result = self._window.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename="captures.csv",
            file_types=("CSV Files (*.csv)", "All files (*.*)"),
        )
        if not result:
            return None
        file_path = result if isinstance(result, str) else result[0]
        if not file_path.lower().endswith(".csv"):
            file_path += ".csv"
        with open(file_path, "w", encoding="utf-8", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(CAPTURE_COLUMNS)
            for row in rows:
                writer.writerow(row.get(key, "") for key in CAPTURE_COLUMNS)
        return file_path

    def open_csv(self) -> Optional[dict]:
        if self._window is None:
            return None
        result = self._window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("CSV Files (*.csv)", "All files (*.*)"),
        )
        if not result:
            return None
        file_path = result[0] if isinstance(result, (list, tuple)) else result
        rows = []
        with open(file_path, "r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            for record in reader:
                rows.append(record)
        return {"file_path": file_path, "rows": rows}

    def _handle_power(self, reading: PowerReading) -> None:
        with self._reading_lock:
            self._latest_reading = reading

    def _handle_settings(self, slots: List[SlotConfig]) -> None:
        self._emit("onSettings", [asdict(slot) for slot in slots])

    def _handle_log(self, direction: str, payload: str) -> None:
        self._emit("onLog", {"direction": direction, "payload": payload, "timestamp": time.time()})

    def _handle_connection_changed(self, connected: bool, error: Optional[str]) -> None:
        self._emit("onConnectionChanged", {"connected": connected, "error": error})

    def _run_ui_pump(self) -> None:
        while not self._pump_stop.is_set():
            time.sleep(_UI_PUMP_INTERVAL_SECONDS)
            with self._reading_lock:
                reading = self._latest_reading
                self._latest_reading = None
            if reading is not None:
                self._emit("onPower", asdict(reading))

    def _emit(self, event_name: str, payload) -> None:
        if self._window is None:
            return
        script = f"window.PowerMeterEvents && window.PowerMeterEvents.{event_name}({json.dumps(payload)})"
        try:
            self._window.evaluate_js(script)
        except Exception:
            pass
