import { useLayoutEffect, useRef } from 'preact/hooks';
import type { NtcParams } from '../ble';
import { adcToCelsius, cellColor } from '../ntc';

export interface Snapshot {
  ts: Date;
  raw: Uint16Array;
}

interface Props {
  snapshots: Snapshot[];
  params: NtcParams | null;
}

export function Gauges({ snapshots, params }: Props) {
  const count = params?.sensors_cnt ?? snapshots[0]?.raw.length ?? 32;
  const lastRowRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    lastRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [snapshots.length]);

  return (
    <div class="gauges" style={{ '--cells-count': count }}>
      {snapshots.map((s, idx) => {
        const isLast = idx === snapshots.length - 1;
        return (
          <div class="snapshot-row" ref={isLast ? lastRowRef : undefined}>
            <span class="time">{formatTime(s.ts)}</span>
            <div class="cells">
              {Array.from({ length: count }, (_, i) => {
                const adc = s.raw[i];
                const t = params && adc !== undefined ? adcToCelsius(adc, params) : NaN;
                return (
                  <span
                    class="cell"
                    title={`#${i + 1}: ${Number.isNaN(t) ? '—' : t.toFixed(1) + '°C'}`}
                    style={{ background: cellColor(t) }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}
