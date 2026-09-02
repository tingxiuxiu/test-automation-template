"""Example pytest case: record signals during the test and attach the interactive
waveform viewer to the Allure report in the teardown phase.

Run:
    python -m pytest tests/ --alluredir=allure-results
    allure serve allure-results
"""
import math

import pytest

from tools.allure_waveform import WaveformRecorder

FS = 50_000
N = 10_000  # 200 ms


def _three_phase(amp: float, ripple: float = 0.0):
    w = 2.0 * math.pi * 50.0 / FS
    for phase in (0.0, -2.0 * math.pi / 3.0, 2.0 * math.pi / 3.0):
        yield [
            amp * math.sin(w * i + phase)
            + ripple * math.sin(2.0 * math.pi * 2000.0 * i / FS + phase)
            for i in range(N)
        ]


@pytest.fixture
def scope():
    """Provide a recorder; the teardown phase dumps the dataset into the viewer HTML."""
    recorder = WaveformRecorder(
        sampling_rate=FS,
        meta={
            "adc": {"bits": 12, "vref": 3.3, "channels": 8},
            "test": {"name": "Motor startup - nominal load", "start": "2026-09-02T10:30:00"},
        },
    )
    yield recorder
    recorder.set_meta(memory={"usedBytes": N * 8 * 8, "totalBytes": 10 * 1024 * 1024})
    recorder.attach(name="Motor waveforms")


def test_motor_startup(scope: WaveformRecorder):
    # ... actual hardware/DUT interaction would happen here; arrays are the
    # sampled waveforms produced by the test (here: simulated).
    for name, samples in zip(("Uu", "Uv", "Uw"), _three_phase(311.1)):
        scope.record(name, samples)
    for name, samples in zip(("Iu", "Iv", "Iw"), _three_phase(8.0, 0.4)):
        scope.record(name, samples)
    scope.record(
        "Nm", [2850.0 * i / N + 25.0 * math.sin(2.0 * math.pi * 30.0 * i / FS) for i in range(N)]
    )
    scope.record(
        "Tl",
        [2.0 if i < N // 4 else 6.0 if i < N // 2 else 10.0 if i < 3 * N // 4 else 8.0 for i in range(N)],
    )

    assert len(scope.signals["Uu"]) == N
    assert abs(scope.signals["Uu"][0]) < 1.0
