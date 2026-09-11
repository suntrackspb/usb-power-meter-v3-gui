# USB RF Power Meter (V3) — serial protocol

Reverse-engineered from the official Windows app's docs (`rf_power_meter_100khz_to10Ghz/Dock/USB-RF-Power-Meter.docx`)
and confirmed live against a real device on macOS. Reference implementation: `pm.py` in this project.

## Transport

- Appears as a USB-CDC (virtual COM port) device, e.g. `/dev/cu.usbmodem...` on macOS,
  `COMx` on Windows. Driver: STM32 VCP (found in `App/STM32F4USB.../`).
- **Baud rate: 921600**. (Note: the unrelated `USBPowerMeterV5-GUI` open-source project
  uses 460800 — that's for a different hardware revision (V5) and does NOT apply here.)
- All commands are ASCII, terminated with `\r\n`.
- The device continuously streams power-measurement frames on its own, unprompted,
  as soon as it's powered/connected — this stream never stops, even while waiting for
  a reply to another command. Any read loop MUST scan/filter for the frame it wants
  rather than assuming the first bytes back are the reply it expects.

## Commands (host -> device)

### Read current settings
```
Read\r\n
```
Device replies with a `R...` settings frame (see below), which arrives interleaved
with the ongoing power stream.

### Write one config slot
```
{LETTER}{FFFF}{+/-}{OO.O}\r\n
```
- `LETTER`: `A`..`I` for slots 1..9
- `FFFF`: frequency in MHz, 4 digits, zero-padded (e.g. `0869`)
- `{+/-}{OO.O}`: offset in dBm, sign + 2 digits + `.` + 1 decimal (e.g. `+44.0`, `-05.5`)

Example: `A5658+10.0\r\n` sets slot 1 to 5658 MHz, +10.0 dBm offset.

**IMPORTANT — tested and confirmed broken:** the docs describe a way to set all 9 slots
in one concatenated line (`AXXXX+XX.XBXXXX+XX.X...IXXXX+XX.X\r\n`). This does NOT work
reliably on the real device — only the FIRST slot in the concatenated line actually gets
applied; the rest are silently ignored. **Always send one write command per slot**,
each on its own line.

### Set sampling rate
```
S0\r\n   # L (low)    -- official app labels this 1000ms/fps
S1\r\n   # M (medium) -- official app labels this 200ms/fps -- device power-on default
S2\r\n   # H (high)   -- official app labels this 0.5ms/fps
```
Empirically measured frame throughput over the serial link (1-second sampling window)
roughly matches this ordering (S0 slowest, S2 fastest by far) but our measured numbers
don't line up exactly with the official app's labeled ms/fps values (e.g. we saw ~10
frames/sec at S1, not the "200ms/fps" -> 5/sec the label implies, and thousands/sec at
S2 rather than a clean "0.5ms/fps" -> 2000/sec). Treat the official labels as the
authoritative *intended* rates and our measurements as rough confirmation of ordering,
not as calibrated numbers -- link/USB overhead and our own read-loop granularity likely
skew the observed rate.

## Replies / streams (device -> host)

### Settings reply (`R...`)
Sent once in response to `Read`, interleaved with the power stream:
```
R{slot1}{slot2}...{slot9}
```
Each `{slotN}` is 9 chars: `FFFF{+/-}OO.O` (same layout as the write command, minus the
letter). Total length after `R` is 9*9 = 81 chars. There is no unique terminator that's
safe to split on (a trailing `A` sometimes follows but is NOT reliable framing on its own,
since power-stream frames also end in `A` and get interleaved) — **parse by locating `R`
in the buffer and taking exactly the next 81 characters**, don't rely on scanning for a
following terminator character.

### Power stream frame (`a...A`)
Continuous, unprompted, one frame roughly every `1/rate` seconds depending on the
current sampling rate (see S0/S1/S2 above):
```
a{sign}{DDD}{PPPPP}{U}A
```
- `a` : frame start marker
- `{sign}`: `+` or `-`
- `{DDD}`: 3 digits = dBm value * 10 (e.g. `084` = 8.4 dBm)
- `{PPPPP}`: 5 digits = power value * 100, in the unit given by `{U}`
- `{U}`: `u` = µW, `m` = mW, `w` = W
- `A` : frame end marker

Example: `a-08414421uA` → sign `-`, dBm = -8.4, power = 144.21 µW.

Parse by scanning the buffer for `a`, then the next `A`, and validating the 10 chars
in between match `[+-]\d{8}[umw]` before trusting them (both to skip garbage and to
avoid misidentifying part of an `R...` settings reply as a power frame, or vice versa).

## Timing quirks (learned empirically, not documented)

- **After any settings write** (`set_slot` / any `{LETTER}...` command), the device needs
  roughly **1.0–1.5 seconds to "settle"** before it reliably answers a subsequent `Read`.
  Reading too soon after a write can time out waiting for the `R...` reply even though
  the write itself was accepted (verified: the value did get applied, `Read` just didn't
  answer promptly). Recommended: sleep ~1.5s after every settings write before the next
  `Read`.
- Opening/closing the serial port rapidly and repeatedly (e.g. a fresh `serial.Serial()`
  per command) seems to work but is slower and less predictable than keeping one
  persistent connection open across a sequence of commands — prefer reusing one
  `serial.Serial` handle for a batch of operations.
- The power stream never pauses, including during a settings write/read exchange —
  always design read logic to coexist with it, never assume a quiet channel.

## Not yet explored

- What the official app's "Clear All" / "Synchroni" buttons send exactly beyond `Read`/
  `S0-2` (seen in a screenshot of the official app's command log, but not decoded from
  a live capture).
- Any error/status frames beyond the two frame types above.
- Whether there's a way to persist settings across power cycles beyond the 9 slots
  (i.e. is slot state itself already the persisted EEPROM state, or is there a separate
  save command).
