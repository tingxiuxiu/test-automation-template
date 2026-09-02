import { useEffect, useState } from 'react';
import { WaveformApp } from './components/WaveformApp';
import { loadDataset } from './data/load';
import type { WaveformDataset } from './types';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; dataset: WaveformDataset }
  | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((dataset) => {
        if (!cancelled) setState({ status: 'ready', dataset });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Motor Waveform Scope</h1>
          <p className="subtitle">
            {state.status === 'ready'
              ? [
                  state.dataset.meta?.test?.name ?? 'Waveform capture',
                  state.dataset.meta?.test?.start,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Loading…'}
          </p>
        </div>
        <div className="header-hints mono">
          drag: region · A/B: cursors · wheel: zoom · shift+drag: pan · dbl-click: fit
        </div>
      </header>

      {state.status === 'loading' && <div className="app-message">Loading waveform data…</div>}
      {state.status === 'error' && (
        <div className="app-message error">
          Failed to load waveform data: {state.message}
        </div>
      )}
      {state.status === 'ready' && <WaveformApp dataset={state.dataset} />}
    </div>
  );
}
