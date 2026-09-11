from dataclasses import dataclass
from typing import List

import serial.tools.list_ports


@dataclass(frozen=True)
class SerialPortInfo:
    device: str
    description: str


def list_serial_ports() -> List[SerialPortInfo]:
    return [
        SerialPortInfo(device=p.device, description=p.description or p.device)
        for p in serial.tools.list_ports.comports()
    ]
