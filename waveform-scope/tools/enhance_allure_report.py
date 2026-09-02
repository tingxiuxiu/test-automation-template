#!/usr/bin/env python3
"""Post-process a generated Allure report so waveform attachments are shown
directly (complete scaled-down, interactive, expandable to fullscreen) on each
test case detail page.

Usage:
    python3 tools/enhance_allure_report.py allure-report

Runs after `allure generate`; idempotent (skips if already enhanced).
The npm script `npm run report` chains both commands.
"""
from __future__ import annotations

import argparse
from pathlib import Path

MARKER = "data-waveform-embed"


def enhance(report_dir: Path) -> None:
    index = report_dir / "index.html"
    if not index.is_file():
        raise SystemExit(f"error: {index} not found — run `allure generate` first")

    html = index.read_text(encoding="utf-8")
    if MARKER in html:
        print(f"{index} already enhanced, nothing to do")
        return

    js_path = Path(__file__).with_name("waveform_embed.js")
    script = f"<script {MARKER} defer>\n{js_path.read_text(encoding='utf-8')}\n</script>"

    if "</body>" not in html:
        raise SystemExit(f"error: no </body> tag found in {index}")

    index.write_text(html.replace("</body>", f"{script}\n</body>"), encoding="utf-8")
    print(f"enhanced {index}: waveform attachments will embed on case detail pages")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_dir", type=Path, help="path to the generated allure-report directory")
    args = parser.parse_args()
    enhance(args.report_dir)


if __name__ == "__main__":
    main()
