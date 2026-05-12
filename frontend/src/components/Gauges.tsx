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
  const lastRowRef = useRef<HTMLTableRowElement | null>(null);

  useLayoutEffect(() => {
    lastRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [snapshots.length]);

  return (
    <table class="gauges">
      <thead>
        <tr>
          <th class="time">время</th>
          {Array.from({ length: count }, (_, i) => <th>{i + 1}</th>)}
        </tr>
      </thead>
      <tbody>
        {snapshots.map((s, idx) => {
          const isLast = idx === snapshots.length - 1;
          return (
            <tr ref={isLast ? lastRowRef : undefined}>
              <td class="time">{formatTime(s.ts)}</td>
              {Array.from({ length: count }, (_, i) => {
                const adc = s.raw[i];
                const t = params && adc !== undefined ? adcToCelsius(adc, params) : NaN;
                return (
                  <td style={{ background: cellColor(t) }}>
                    {Number.isNaN(t) ? '—' : t.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function formatTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}
