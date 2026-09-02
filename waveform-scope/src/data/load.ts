import { ALL_SIGNAL_KEYS } from '../config/signals';
import type { SignalKey, WaveformDataset } from '../types';

declare global {
  interface Window {
    __WAVEFORM_DATA__?: unknown;
  }
}

function normalize(raw: Record<string, unknown>): WaveformDataset {
  const samplingRate = Number(
    (raw as { samplingRate?: unknown; sampling_rate?: unknown; fs?: unknown }).samplingRate ??
      (raw as { sampling_rate?: unknown }).sampling_rate ??
      (raw as { fs?: unknown }).fs ??
      1000,
  );
  const rawSignals = (raw as { signals?: Record<string, unknown> }).signals ?? {};
  const signals: Partial<Record<SignalKey, number[]>> = {};
  for (const key of ALL_SIGNAL_KEYS) {
    const arr = rawSignals[key];
    if (Array.isArray(arr) && arr.length > 0) {
      signals[key] = arr.map(Number);
    }
  }
  if (Object.keys(signals).length === 0) {
    throw new Error('No known signals found (expected Uu/Uv/Uw/Iu/Iv/Iw/Nm/Tl).');
  }
  const meta = (raw as { meta?: WaveformDataset['meta'] }).meta ?? {};
  return { samplingRate, signals, meta };
}

/**
 * Load the waveform dataset:
 * 1. from `window.__WAVEFORM_DATA__` (injected by tools/allure_waveform.py), or
 * 2. from `data/signals.json` (dev server / local preview fallback).
 */
export async function loadDataset(): Promise<WaveformDataset> {
  const injected = window.__WAVEFORM_DATA__;
  if (injected && typeof injected === 'object' && 'signals' in (injected as object)) {
    return normalize(injected as Record<string, unknown>);
  }
  const res = await fetch('data/signals.json');
  if (!res.ok) throw new Error(`Failed to load sample data (${res.status}).`);
  return normalize(await res.json());
}
