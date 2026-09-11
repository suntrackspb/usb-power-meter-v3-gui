import serial

from . import protocol


class Device:
    def __init__(self, port: str, baud: int = protocol.BAUD_RATE, timeout: float = 0.2):
        self._serial = serial.Serial(port, baud, timeout=timeout)

    @property
    def port(self) -> str:
        return self._serial.port

    def close(self) -> None:
        self._serial.close()

    def read_available(self, size: int = 4096) -> bytes:
        return self._serial.read(size)

    def write_read_command(self) -> None:
        self._serial.write(protocol.build_read_command())
        self._serial.flush()

    def write_slot(self, slot_index: int, frequency_mhz: int, offset_dbm: float) -> None:
        command = protocol.build_slot_command(slot_index, frequency_mhz, offset_dbm)
        self._serial.write(command.encode("ascii"))
        self._serial.flush()

    def write_sample_rate(self, level: int) -> None:
        command = protocol.build_sample_rate_command(level)
        self._serial.write(command.encode("ascii"))
        self._serial.flush()

    def reset_input_buffer(self) -> None:
        self._serial.reset_input_buffer()
