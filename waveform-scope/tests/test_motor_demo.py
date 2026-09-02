"""Three motor test cases; each attaches an interactive waveform analysis view
to the Allure report in the fixture teardown phase.

Run:
    python -m pytest tests/ --alluredir=allure-results
    npx allure generate allure-results -o allure-report --clean
    npx allure open allure-report        # or: python -m http.server -d allure-report 8000
"""
import math

import allure
import pytest

from tools.allure_waveform import WaveformRecorder

FS = 50_000
N = 10_000  # 200 ms capture


# ---- signal synthesis helpers (simulating DUT sampling) --------------------

def three_phase(n: int, amp: float, ripple: float = 0.0, fs: int = FS, freq: float = 50.0):
    w = 2.0 * math.pi * freq / fs
    for phase in (0.0, -2.0 * math.pi / 3.0, 2.0 * math.pi / 3.0):
        yield [
            amp * math.sin(w * i + phase)
            + ripple * math.sin(2.0 * math.pi * 2000.0 * i / fs + phase)
            for i in range(n)
        ]


def _meta(name: str, **extra):
    meta = {
        "adc": {"bits": 12, "vref": 3.3, "channels": 8},
        "test": {"name": name, "start": "2026-09-02T10:30:00"},
        "memory": {"usedBytes": N * 8 * 8, "totalBytes": 10 * 1024 * 1024},
    }
    meta.update(extra)
    return meta


@pytest.fixture
def scope(request):
    """Provide a recorder; teardown dumps the dataset into the viewer HTML and
    attaches it to this test case in the Allure report."""
    test_name = request.node.name
    recorder = WaveformRecorder(
        sampling_rate=FS,
        meta=_meta(f"Motor test - {test_name}"),
    )
    yield recorder
    recorder.attach(name=f"Waveform analysis - {test_name}")


# ---- Case 1: normal startup -------------------------------------------------

@allure.epic("Motor Drive")
@allure.feature("Startup")
@allure.story("Nominal load")
@allure.severity(allure.severity_level.CRITICAL)
def test_startup_nominal_load(scope: WaveformRecorder):
    """Startup under nominal load: balanced 311 V / 8 A phases, ramp to 2850 rpm."""
    for name, samples in zip(("Uu", "Uv", "Uw"), three_phase(N, 311.1)):
        scope.record(name, samples)
    for name, samples in zip(("Iu", "Iv", "Iw"), three_phase(N, 8.0, 0.4)):
        scope.record(name, samples)
    scope.record("Nm", [2850.0 * i / N + 25.0 * math.sin(2.0 * math.pi * 30.0 * i / FS) for i in range(N)])
    scope.record(
        "Tl",
        [2.0 if i < N // 4 else 6.0 if i < N // 2 else 10.0 if i < 3 * N // 4 else 8.0 for i in range(N)],
    )

    with allure.step("Check phase voltage amplitude"):
        vpp = max(scope.signals["Uu"]) - min(scope.signals["Uu"])
        assert 615.0 < vpp < 630.0, f"Uu Vpp out of range: {vpp:.1f}"

    with allure.step("Check startup completes at nominal speed"):
        assert scope.signals["Nm"][-1] > 2800.0


# ---- Case 2: overcurrent protection ------------------------------------------

@allure.epic("Motor Drive")
@allure.feature("Protection")
@allure.story("Overcurrent trip")
@allure.severity(allure.severity_level.BLOCKER)
def test_overcurrent_protection_trips(scope: WaveformRecorder):
    """Locked-rotor style fault: current ramps beyond the 20 A trip threshold
    and the phase voltages are cut ~120 ms into the capture."""
    trip = 3 * N // 5  # trip moment (sample index)

    for name, samples in zip(("Uu", "Uv", "Uw"), three_phase(N, 311.1)):
        scope.record(name, [v if i < trip else 0.0 for i, v in enumerate(samples)])

    for name, samples in zip(("Iu", "Iv", "Iw"), three_phase(N, 8.0, 0.4)):
        # current climbs linearly to ~26 A until the trip cuts it
        scope.record(
            name,
            [v * (1.0 + 2.2 * i / trip) if i < trip else 0.0 for i, v in enumerate(samples)],
        )

    scope.record("Nm", [120.0 * math.exp(-i / (FS * 0.02)) if i < trip else 0.0 for i in range(N)])
    scope.record("Tl", [18.0 if i < trip else 0.0 for i in range(N)])

    with allure.step("Check current exceeded trip threshold before cutoff"):
        peak = max(max(scope.signals["Iu"]), abs(min(scope.signals["Iu"])))
        assert peak > 20.0, f"peak current {peak:.1f} A never crossed 20 A threshold"

    with allure.step("Check phases are de-energized after trip"):
        assert all(abs(v) < 1e-6 for v in scope.signals["Uu"][trip + 50:])


# ---- Case 3: speed step response ----------------------------------------------

@allure.epic("Motor Drive")
@allure.feature("Speed control")
@allure.story("Step response")
@allure.severity(allure.severity_level.NORMAL)
def test_speed_step_response(scope: WaveformRecorder):
    """Speed reference steps 1500 → 3000 rpm at 100 ms; check settling."""
    step = N // 2

    for name, samples in zip(("Uu", "Uv", "Uw"), three_phase(N, 155.5)):
        scope.record(name, [v if i < step else v * 2 for i, v in enumerate(samples)])
    for name, samples in zip(("Iu", "Iv", "Iw"), three_phase(N, 4.0, 0.3)):
        scope.record(name, [v if i < step else v * 1.8 for i, v in enumerate(samples)])

    # first-order speed response: 1500 rpm, then exponential approach to 3000
    tau = FS * 0.015  # 15 ms time constant
    speed = []
    for i in range(N):
        if i < step:
            speed.append(1500.0 + 8.0 * math.sin(2.0 * math.pi * 40.0 * i / FS))
        else:
            t = (i - step) / tau
            speed.append(3000.0 - 1500.0 * math.exp(-t))
    scope.record("Nm", speed)
    scope.record("Tl", [5.0 if i < step else 5.0 + 3.0 * (1.0 - math.exp(-(i - step) / tau)) for i in range(N)])

    with allure.step("Check final speed within 2% of the 3000 rpm target"):
        final = speed[-1]
        assert abs(final - 3000.0) / 3000.0 < 0.02, f"settled at {final:.0f} rpm"

    with allure.step("Check no overshoot beyond 5%"):
        assert max(speed) < 3150.0
