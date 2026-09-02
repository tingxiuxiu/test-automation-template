import { formatDuration } from './format';

export interface TimeTick {
  /** Tick position in seconds. */
  t: number;
  label: string;
}

const NICE_STEPS = [1, 2, 5];

/**
 * "Nice" time ticks (1/2/5 decades) so every lane and the shared time axis
 * render identical grid lines for a given viewport.
 */
export function niceTimeTicks(t0: number, t1: number, widthPx: number, minPxPerTick = 80): TimeTick[] {
  const span = t1 - t0;
  if (!(span > 0) || widthPx <= 0) return [];
  const target = span / Math.max(1, Math.floor(widthPx / minPxPerTick));
  const magnitude = Math.pow(10, Math.floor(Math.log10(target)));
  let step = NICE_STEPS[NICE_STEPS.length - 1] * magnitude;
  for (const s of NICE_STEPS) {
    if (s * magnitude >= target) {
      step = s * magnitude;
      break;
    }
  }
  const ticks: TimeTick[] = [];
  const first = Math.ceil(t0 / step - 1e-9) * step;
  const count = Math.floor((t1 - first) / step + 1e-9) + 1;
  for (let i = 0; i < count; i++) {
    const t = first + i * step;
    ticks.push({ t, label: formatDuration(t) });
  }
  return ticks;
}
