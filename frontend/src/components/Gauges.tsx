import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { NtcParams } from '../ble';
import { adcToCelsius, cellColor } from '../ntc';

export interface Snapshot {
  ts: Date;
  raw: Uint16Array;
  // Number of underlying snapshots this entry represents.
  // Undefined or 1 means the entry is a raw single sample.
  count?: number;
}

interface Props {
  snapshots: Snapshot[];
  params: NtcParams | null;
}

export function Gauges({ snapshots, params }: Props) {
  const count = params?.sensors_cnt ?? snapshots[0]?.raw.length ?? 32;
  const lastRowRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useLayoutEffect(() => {
    lastRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [snapshots.length]);

  return (
    <div class="gauges" style={{ '--cells-count': count }}>
      {snapshots.map((s, idx) => {
        const isLast = idx === snapshots.length - 1;
        return (
          <div class="snapshot-row">
            <span
              class={`time${(s.count ?? 1) > 1 ? ' aggregated' : ''}`}
              title={timeTitle(s)}
            >
              {formatAge(now - s.ts.getTime())}
            </span>
            <div class="cells" ref={isLast ? lastRowRef : undefined}>
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

function timeTitle(s: Snapshot): string {
  const base = s.ts.toLocaleString();
  return s.count && s.count > 1 ? `${base} (среднее по ${s.count} снимкам)` : base;
}

function formatAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 1) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}
