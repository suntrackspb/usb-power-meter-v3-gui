import queue
import threading
import time
from dataclasses import dataclass
from typing import Callable, List, Optional, Union

from . import protocol
from .device import Device
from .protocol import PowerReading, SlotConfig


@dataclass(frozen=True)
class ConnectCommand:
    port: str


@dataclass(frozen=True)
class DisconnectCommand:
    pass


@dataclass(frozen=True)
class WriteSlotCommand:
    slot_index: int
    frequency_mhz: int
    offset_dbm: float


@dataclass(frozen=True)
class SetSampleRateCommand:
    level: int


@dataclass(frozen=True)
class RequestSettingsCommand:
    pass


Command = Union[
    ConnectCommand,
    DisconnectCommand,
    WriteSlotCommand,
    SetSampleRateCommand,
    RequestSettingsCommand,
]

OnPower = Callable[[PowerReading], None]
OnSettings = Callable[[List[SlotConfig]], None]
OnLog = Callable[[str, str], None]
OnConnectionChanged = Callable[[bool, Optional[str]], None]

_READ_CHUNK_SIZE = 4096
_MAX_BUFFER_SIZE = 8192
_LOOP_IDLE_SLEEP_SECONDS = 0.01


class DeviceWorker(threading.Thread):
    def __init__(
        self,
        on_power: OnPower,
        on_settings: OnSettings,
        on_log: OnLog,
        on_connection_changed: OnConnectionChanged,
    ):
        super().__init__(daemon=True)
        self._commands: "queue.Queue[Command]" = queue.Queue()
        self._on_power = on_power
        self._on_settings = on_settings
        self._on_log = on_log
        self._on_connection_changed = on_connection_changed
        self._device: Optional[Device] = None
        self._buffer = ""
        self._settle_deadline = 0.0
        self._stop_requested = threading.Event()

    def connect(self, port: str) -> None:
        self._commands.put(ConnectCommand(port))

    def disconnect(self) -> None:
        self._commands.put(DisconnectCommand())

    def write_slot(self, slot_index: int, frequency_mhz: int, offset_dbm: float) -> None:
        self._commands.put(WriteSlotCommand(slot_index, frequency_mhz, offset_dbm))

    def set_sample_rate(self, level: int) -> None:
        self._commands.put(SetSampleRateCommand(level))

    def request_settings(self) -> None:
        self._commands.put(RequestSettingsCommand())

    def stop(self) -> None:
        self._stop_requested.set()
        self.disconnect()

    def run(self) -> None:
        while not self._stop_requested.is_set():
            self._drain_commands()
            if self._device is not None:
                self._pump_serial()
            else:
                time.sleep(_LOOP_IDLE_SLEEP_SECONDS)

    def _drain_commands(self) -> None:
        while True:
            try:
                command = self._commands.get_nowait()
            except queue.Empty:
                return
            self._handle_command(command)

    def _handle_command(self, command: Command) -> None:
        if isinstance(command, ConnectCommand):
            self._handle_connect(command.port)
        elif isinstance(command, DisconnectCommand):
            self._handle_disconnect()
        elif isinstance(command, WriteSlotCommand):
            self._handle_write_slot(command)
        elif isinstance(command, SetSampleRateCommand):
            self._handle_set_sample_rate(command)
        elif isinstance(command, RequestSettingsCommand):
            self._handle_request_settings()

    def _handle_connect(self, port: str) -> None:
        if self._device is not None:
            self._handle_disconnect()
        try:
            self._device = Device(port)
        except Exception as error:
            self._on_connection_changed(False, str(error))
            return
        self._buffer = ""
        self._on_connection_changed(True, None)
        self._handle_request_settings()

    def _handle_disconnect(self) -> None:
        if self._device is None:
            return
        self._device.close()
        self._device = None
        self._buffer = ""
        self._on_connection_changed(False, None)

    def _handle_write_slot(self, command: WriteSlotCommand) -> None:
        if self._device is None:
            return
        try:
            self._device.write_slot(command.slot_index, command.frequency_mhz, command.offset_dbm)
        except Exception:
            self._handle_disconnect()
            return
        self._settle_deadline = time.monotonic() + protocol.SETTLE_SECONDS
        letter = protocol.SLOT_LETTERS[command.slot_index - 1]
        self._on_log("tx", f"{letter}{command.frequency_mhz:04d}{command.offset_dbm:+05.1f}")

    def _handle_set_sample_rate(self, command: SetSampleRateCommand) -> None:
        if self._device is None:
            return
        try:
            self._device.write_sample_rate(command.level)
        except Exception:
            self._handle_disconnect()
            return
        self._on_log("tx", f"S{command.level}")

    def _handle_request_settings(self) -> None:
        if self._device is None:
            return
        remaining = self._settle_deadline - time.monotonic()
        if remaining > 0:
            time.sleep(remaining)
        try:
            self._device.reset_input_buffer()
            self._device.write_read_command()
        except Exception:
            self._handle_disconnect()
            return
        self._buffer = ""
        self._on_log("tx", "Read")

    def _pump_serial(self) -> None:
        assert self._device is not None
        try:
            chunk = self._device.read_available(_READ_CHUNK_SIZE)
        except Exception:
            self._handle_disconnect()
            return
        if chunk:
            self._buffer += chunk.decode("ascii", errors="replace")
        self._process_buffer()

    def _process_buffer(self) -> None:
        while True:
            r_index = self._buffer.find("R")
            a_index = self._buffer.find("a")

            if r_index != -1 and (a_index == -1 or r_index < a_index):
                reply_end = r_index + 1 + protocol.SETTINGS_REPLY_BODY_LENGTH
                if len(self._buffer) < reply_end:
                    return
                body = self._buffer[r_index + 1:reply_end]
                slots = protocol.parse_settings_reply(body)
                self._on_log("rx", f"R{body[:24]}…" if len(body) > 24 else f"R{body}")
                self._on_settings(slots)
                self._buffer = self._buffer[reply_end:]
                continue

            if a_index != -1:
                frame_end = self._buffer.find("A", a_index + 1)
                if frame_end == -1:
                    if len(self._buffer) - a_index > 64:
                        self._buffer = self._buffer[a_index + 1:]
                        continue
                    return
                frame = self._buffer[a_index + 1:frame_end]
                reading = protocol.parse_power_frame(frame)
                if reading is not None:
                    self._on_power(reading)
                self._buffer = self._buffer[frame_end + 1:]
                continue

            if len(self._buffer) > _MAX_BUFFER_SIZE:
                self._buffer = self._buffer[-256:]
            return
