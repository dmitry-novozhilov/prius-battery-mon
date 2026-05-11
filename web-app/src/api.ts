import type { NtcParams } from './ble';

export interface Snapshot {
  ts: string;
  device: string;
  raw: number[];
  ntc: NtcParams;
}

export async function postSnapshot(s: Snapshot): Promise<void> {
  const res = await fetch('/api/snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`POST /api/snapshot ${res.status}: ${text}`);
  }
}
