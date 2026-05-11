import type { NtcParams } from '../ble';
import { adcToCelsius, cellColor } from '../ntc';

interface Props {
  raw: Uint16Array | null;
  params: NtcParams | null;
}

export function Gauges({ raw, params }: Props) {
  const count = params?.sensors_cnt ?? raw?.length ?? 32;
  const cells = Array.from({ length: count }, (_, i) => {
    const adc = raw?.[i];
    const t = raw && params && adc !== undefined ? adcToCelsius(adc, params) : NaN;
    return { i, adc, t };
  });

  return (
    <table class="gauges">
      <thead>
        <tr>
          {cells.map(({ i }) => <th>{i + 1}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr>
          {cells.map(({ t }) => (
            <td style={{ background: cellColor(t) }}>
              {Number.isNaN(t) ? '—' : t.toFixed(1)}
            </td>
          ))}
        </tr>
        <tr class="raw">
          {cells.map(({ adc }) => (
            <td>{adc ?? '—'}</td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
