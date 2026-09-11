from dataclasses import dataclass
from typing import List, Optional

BAUD_RATE = 921600
SLOT_COUNT = 9
SLOT_LETTERS = "ABCDEFGHI"
SLOT_FIELD_WIDTH = 9
SETTINGS_REPLY_BODY_LENGTH = SLOT_COUNT * SLOT_FIELD_WIDTH
SETTLE_SECONDS = 1.5

SAMPLE_RATE_LOW = 0
SAMPLE_RATE_MEDIUM = 1
SAMPLE_RATE_HIGH = 2
SAMPLE_RATE_LEVELS = (SAMPLE_RATE_LOW, SAMPLE_RATE_MEDIUM, SAMPLE_RATE_HIGH)

POWER_UNITS = {"u": "uW", "m": "mW", "w": "W"}


@dataclass(frozen=True)
class SlotConfig:
    index: int
    frequency_mhz: int
    offset_dbm: float

    @property
    def letter(self) -> str:
        return SLOT_LETTERS[self.index - 1]


@dataclass(frozen=True)
class PowerReading:
    dbm: float
    power: float
    unit: str


def build_read_command() -> bytes:
    return b"Read\r\n"


def build_slot_command(slot_index: int, frequency_mhz: int, offset_dbm: float) -> str:
    if not (1 <= slot_index <= SLOT_COUNT):
        raise ValueError(f"slot_index must be between 1 and {SLOT_COUNT}")
    letter = SLOT_LETTERS[slot_index - 1]
    return f"{letter}{frequency_mhz:04d}{offset_dbm:+05.1f}\r\n"


def build_sample_rate_command(level: int) -> str:
    if level not in SAMPLE_RATE_LEVELS:
        raise ValueError(f"level must be one of {SAMPLE_RATE_LEVELS}")
    return f"S{level}\r\n"


def parse_settings_reply(body: str) -> List[SlotConfig]:
    slots = []
    for i in range(SLOT_COUNT):
        chunk = body[i * SLOT_FIELD_WIDTH:(i + 1) * SLOT_FIELD_WIDTH]
        if len(chunk) < SLOT_FIELD_WIDTH:
            break
        frequency_mhz = int(chunk[0:4])
        offset_dbm = float(chunk[4:9])
        slots.append(SlotConfig(index=i + 1, frequency_mhz=frequency_mhz, offset_dbm=offset_dbm))
    return slots


def parse_power_frame(frame: str) -> Optional[PowerReading]:
    if len(frame) != 10 or frame[0] not in "+-" or frame[9] not in POWER_UNITS:
        return None
    if not frame[1:9].isdigit():
        return None
    dbm = float(frame[0] + frame[1:4]) / 10.0
    power = float(frame[4:9]) / 100.0
    return PowerReading(dbm=dbm, power=power, unit=POWER_UNITS[frame[9]])
