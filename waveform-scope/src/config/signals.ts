import type { SignalGroup, SignalKey, SignalMeta } from '../types';

/**
 * Single source of truth for every signal: grouping, colors and units.
 * Add or rename signals here and the whole UI follows.
 */
export const SIGNALS: Record<SignalKey, SignalMeta> = {
  Uu: { key: 'Uu', label: 'Uu', group: 'voltage', color: '#fbbf24', unit: 'V' },
  Uv: { key: 'Uv', label: 'Uv', group: 'voltage', color: '#4ade80', unit: 'V' },
  Uw: { key: 'Uw', label: 'Uw', group: 'voltage', color: '#f87171', unit: 'V' },
  Iu: { key: 'Iu', label: 'Iu', group: 'current', color: '#38bdf8', unit: 'A' },
  Iv: { key: 'Iv', label: 'Iv', group: 'current', color: '#60a5fa', unit: 'A' },
  Iw: { key: 'Iw', label: 'Iw', group: 'current', color: '#c084fc', unit: 'A' },
  Nm: { key: 'Nm', label: 'Nm', group: 'motor', color: '#a78bfa', unit: 'rpm' },
  Tl: { key: 'Tl', label: 'Tl', group: 'motor', color: '#34d399', unit: 'N·m' },
};

/** Voltage/current pairs — one switch on the control panel toggles both. */
export const VOLTAGE_CURRENT_PAIRS: ReadonlyArray<{
  voltage: SignalKey;
  current: SignalKey;
}> = [
  { voltage: 'Uu', current: 'Iu' },
  { voltage: 'Uv', current: 'Iv' },
  { voltage: 'Uw', current: 'Iw' },
];

export const MOTOR_SIGNALS: readonly SignalKey[] = ['Nm', 'Tl'];

export const GROUP_ORDER: readonly SignalGroup[] = ['voltage', 'current', 'motor'];

export const GROUP_TITLES: Record<SignalGroup, string> = {
  voltage: 'VOLTAGE',
  current: 'CURRENT',
  motor: 'SPEED / LOAD',
};

export const ALL_SIGNAL_KEYS = Object.keys(SIGNALS) as SignalKey[];
