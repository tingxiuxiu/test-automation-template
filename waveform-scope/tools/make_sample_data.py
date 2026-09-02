#!/usr/bin/env python3
"""Generate a sample dataset (public/data/signals.json) for dev mode / demo.

Schema is exactly what the React scope and tools/allure_waveform.py expect:
{
  "samplingRate": 50000,
  "signals": {"Uu": [...], "Uv": [...], "Uw": [...],
              "Iu": [...], "Iv": [...], "Iw": [...],
              "Nm": [...], "Tl": [...]},
  "meta": {"adc": {...}, "memory": {...}, "test": {...}}
}
"""
import json
import math
from pathlib import Path

FS = 50_000          # sampling rate [Hz]
N = 10_000           # samples -> 200 ms capture
F_MAINS = 50.0       # phase voltage frequency [Hz]
U_PK = 311.1         # phase voltage peak [V]
I_PK = 8.0           # current peak [A]
I_RIPPLE = 0.4       # 2 kHz switching ripple [A]
NOM_SPEED = 2850.0   # nominal speed [rpm]

TWO_PI_3 = 2.0 * math.pi / 3.0


def three_phase(amp: float, ripple: float = 0.0):
    w = 2.0 * math.pi * F_MAINS / FS
    for phase in (0.0, -TWO_PI_3, TWO_PI_3):
        yield [
            amp * math.sin(w * i + phase)
            + ripple * math.sin(2.0 * math.pi * 2000.0 * i / FS + phase)
            for i in range(N)
        ]


def main() -> None:
    signals: dict[str, list[float]] = {}
    for name, samples in zip(("Uu", "Uv", "Uw"), three_phase(U_PK)):
        signals[name] = samples
    for name, samples in zip(("Iu", "Iv", "Iw"), three_phase(I_PK, I_RIPPLE)):
        signals[name] = samples
    # speed ramps up to nominal with a small torsional oscillation
    signals["Nm"] = [
        NOM_SPEED * i / N + 25.0 * math.sin(2.0 * math.pi * 30.0 * i / FS) for i in range(N)
    ]
    # load torque steps: 2 -> 6 -> 10 -> 8 N·m
    signals["Tl"] = [
        2.0 if i < N // 4 else 6.0 if i < N // 2 else 10.0 if i < 3 * N // 4 else 8.0
        for i in range(N)
    ]

    dataset = {
        "samplingRate": FS,
        "meta": {
            "test": {"name": "Motor startup - nominal load", "start": "2026-09-02T10:30:00"},
            "adc": {"bits": 12, "vref": 3.3, "channels": 8},
            "memory": {"usedBytes": N * 8 * 8, "totalBytes": 10 * 1024 * 1024},
        },
        "signals": signals,
    }

    out = Path(__file__).resolve().parent.parent / "public" / "data" / "signals.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(dataset))
    print(f"wrote {out} ({N} samples/channel @ {FS} Hz)")


if __name__ == "__main__":
    main()
