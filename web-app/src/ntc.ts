import type { NtcParams } from './ble';

export const DEFAULT_NTC_PARAMS: NtcParams = {
  r0: 10000,
  t0: 25,
  b: 3435,
  pullup: 10000,
  adc_bits: 12,
  sensors_cnt: 32,
};

export function adcToCelsius(raw: number, p: NtcParams): number {
  const maxAdc = (1 << p.adc_bits) - 1;
  if (raw <= 0 || raw >= maxAdc) return NaN;
  const r = (p.pullup * raw) / (maxAdc - raw);
  const t0K = p.t0 + 273.15;
  const invT = 1 / t0K + Math.log(r / p.r0) / p.b;
  return 1 / invT - 273.15;
}

export function cellColor(celsius: number): string {
  if (Number.isNaN(celsius)) return 'hsl(0 0% 70%)';
  let hue: number;
  if (celsius < 0) hue = 220;
  else if (celsius < 25) hue = ((25 - celsius) / 25) * 90 + 120;
  else if (celsius < 50) hue = ((25 - (celsius - 25)) / 25) * 120;
  else hue = 0;
  return `hsl(${hue} 100% 50%)`;
}
