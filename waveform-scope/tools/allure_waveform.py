"""Allure integration for the React waveform scope.

Attaches an interactive, self-contained HTML oscilloscope view (built from
``dist/index.html`` by ``npm run build``) to an Allure report. The signal
dataset is injected into the HTML placeholder at attach time, so a single
template serves every test.

Data schema (identical to ``public/data/signals.json``)::

    {
      "samplingRate": 50000,
      "signals": {"Uu": [...], "Uv": [...], "Uw": [...],
                  "Iu": [...], "Iv": [...], "Iw": [...],
                  "Nm": [...], "Tl": [...]},
      "meta": {"adc": {...}, "memory": {...}, "test": {...}}   # optional
    }

Typical pytest usage (attach in the fixture teardown)::

    from tools.allure_waveform import WaveformRecorder

    @pytest.fixture
    def scope():
        rec = WaveformRecorder(sampling_rate=50_000)
        yield rec
        rec.attach(name="Motor waveforms")   # teardown: dump + attach

    def test_motor_startup(scope):
        scope.record("Uu", [...])
        scope.record("Nm", [...])
        ...

Requires ``allure-pytest`` and a built viewer template (``npm run build``).
"""
from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping

_ROOT = Path(__file__).resolve().parent.parent
_PLACEHOLDER = '"__WAVEFORM_DATA_JSON__"'
_VALID_SIGNALS = ("Uu", "Uv", "Uw", "Iu", "Iv", "Iw", "Nm", "Tl")


def _default_template() -> Path:
    return _ROOT / "dist" / "index.html"


def build_viewer_html(dataset: Mapping[str, Any], template: str | Path | None = None) -> str:
    """Return the self-contained viewer HTML with ``dataset`` injected."""
    tpl = Path(template) if template is not None else _default_template()
    html = tpl.read_text(encoding="utf-8")
    if _PLACEHOLDER not in html:
        raise RuntimeError(
            f"{tpl} does not contain the data placeholder; run `npm run build` first"
        )
    payload = json.dumps(dataset, separators=(",", ":"), allow_nan=False)
    return html.replace(_PLACEHOLDER, payload)


def attach_waveform(
    dataset_or_path: "str | Path | Mapping[str, Any]",
    name: str = "Waveform",
    template: str | Path | None = None,
) -> None:
    """Attach the waveform viewer to the current Allure step/test.

    ``dataset_or_path`` is either an in-memory dataset dict or a path to a JSON
    file with the schema documented in the module docstring.
    """
    import allure  # imported here so the error points at the real problem

    if isinstance(dataset_or_path, (str, Path)):
        dataset = json.loads(Path(dataset_or_path).read_text(encoding="utf-8"))
    else:
        dataset = dict(dataset_or_path)

    html = build_viewer_html(dataset, template=template)
    with tempfile.NamedTemporaryFile(
        "w", suffix=".html", delete=False, encoding="utf-8", prefix="waveform_"
    ) as f:
        f.write(html)
        path = f.name
    allure.attach.file(path, name=name, attachment_type=allure.attachment_type.HTML)


class WaveformRecorder:
    """Collect per-signal sample arrays during a test; attach the viewer at teardown."""

    def __init__(self, sampling_rate: int, meta: Mapping[str, Any] | None = None):
        self.sampling_rate = sampling_rate
        self._signals: dict[str, list[float]] = {}
        self._meta: dict[str, Any] = dict(meta or {})

    def record(self, signal: str, samples: Iterable[float]) -> None:
        """Record one signal's full sample array, e.g. scope.record("Uu", [1, 2, 3])."""
        self._signals[signal] = [float(x) for x in samples]

    def set_meta(self, **meta: Any) -> None:
        self._meta.update(meta)

    @property
    def signals(self) -> dict[str, list[float]]:
        return self._signals

    def dataset(self) -> dict[str, Any]:
        return {
            "samplingRate": self.sampling_rate,
            "signals": self._signals,
            "meta": self._meta,
        }

    def attach(self, name: str = "Waveform", template: str | Path | None = None) -> None:
        unknown = set(self._signals) - set(_VALID_SIGNALS)
        if unknown:
            raise ValueError(f"unknown signal keys {sorted(unknown)}; expected {_VALID_SIGNALS}")
        if not self._signals:
            raise ValueError("no signals recorded; call record() before attach()")
        attach_waveform(self.dataset(), name=name, template=template)
