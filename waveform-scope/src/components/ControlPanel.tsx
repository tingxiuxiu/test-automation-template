import { MOTOR_SIGNALS, SIGNALS, VOLTAGE_CURRENT_PAIRS } from '../config/signals';
import type { SignalKey } from '../types';

interface ControlPanelProps {
  pairOn: boolean[];
  onPairToggle: (index: number) => void;
  motorOn: Record<'Nm' | 'Tl', boolean>;
  onMotorToggle: (key: 'Nm' | 'Tl') => void;
  merge: boolean;
  onMergeToggle: () => void;
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className={`toggle ${checked ? 'on' : ''} ${disabled ? 'disabled' : ''}`} title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        aria-label={label}
      />
      <span className="knob" />
    </label>
  );
}

/**
 * Right-side panel. The three VOLTAGE/CURRENT switches are paired: one toggle
 * controls Ux and Ix together (voltage and current linked display).
 */
export function ControlPanel({
  pairOn,
  onPairToggle,
  motorOn,
  onMotorToggle,
  merge,
  onMergeToggle,
}: ControlPanelProps) {
  return (
    <aside className="control-panel">
      <h2>Control</h2>

      <section className="panel-section">
        <h3>VOLTAGE / CURRENT</h3>
        {VOLTAGE_CURRENT_PAIRS.map((pair, i) => (
          <div className="panel-row" key={pair.voltage}>
            <span className="row-label">
              <i className="dot" style={{ background: SIGNALS[pair.voltage].color }} />
              <i className="dot" style={{ background: SIGNALS[pair.current].color }} />
              {SIGNALS[pair.voltage].label} ↔ {SIGNALS[pair.current].label}
            </span>
            <Toggle
              checked={merge || pairOn[i]}
              disabled={merge}
              onChange={() => onPairToggle(i)}
              label={`${pair.voltage} ↔ ${pair.current}`}
            />
          </div>
        ))}
      </section>

      <section className="panel-section">
        <h3>SPEED / LOAD</h3>
        {MOTOR_SIGNALS.map((key: SignalKey) => (
          <div className="panel-row" key={key}>
            <span className="row-label">
              <i className="dot" style={{ background: SIGNALS[key].color }} />
              {SIGNALS[key].label}
            </span>
            <Toggle
              checked={merge || motorOn[key as 'Nm' | 'Tl']}
              disabled={merge}
              onChange={() => onMotorToggle(key as 'Nm' | 'Tl')}
              label={key}
            />
          </div>
        ))}
      </section>

      <section className="panel-section">
        <h3>DISPLAY</h3>
        <div className="panel-row">
          <span className="row-label">Merge into one view</span>
          <Toggle checked={merge} onChange={onMergeToggle} label="Merge into one view" />
        </div>
        <p className="panel-note">
          {merge
            ? 'All signals on · overlaid per channel group'
            : 'Separate lane per signal · linked toggles'}
        </p>
      </section>

      <section className="panel-section interactions">
        <h3>INTERACTIONS</h3>
        <ul>
          <li>Drag — box-select region</li>
          <li>Near A/B line — drag cursor</li>
          <li>Wheel — zoom</li>
          <li>Shift+drag / axis drag — pan</li>
          <li>Double-click — fit &amp; clear</li>
        </ul>
      </section>
    </aside>
  );
}
