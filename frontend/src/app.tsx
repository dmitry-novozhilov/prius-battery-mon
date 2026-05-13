import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { BleClient, BLE_DEVICE_NAME, type NtcParams } from './ble';
import { DEFAULT_NTC_PARAMS } from './ntc';
import { postSnapshot } from './api';
import { aggregateSnapshots, pickAggregationN } from './aggregate';
import { Gauges, type Snapshot } from './components/Gauges';
import { Controls } from './components/Controls';
import { Legend } from './components/Legend';

// Row height in px: must match .cell height + grid row-gap in styles.css.
const ROW_HEIGHT = 15;

export function App() {
  const bleRef = useRef<BleClient>();
  if (!bleRef.current) bleRef.current = new BleClient();
  const ble = bleRef.current;

  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [params, setParams] = useState<NtcParams | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [emulating, setEmulating] = useState(false);
  const [targetRows, setTargetRows] = useState(20);

  const paramsRef = useRef<NtcParams | null>(null);
  paramsRef.current = params;

  const gaugesAreaRef = useRef<HTMLDivElement | null>(null);

  const appendSnapshot = (data: Uint16Array, device: string) => {
    const ts = new Date();
    setSnapshots((prev) => [...prev, { ts, raw: data }]);
    const p = paramsRef.current;
    if (!p) return;
    postSnapshot({
      ts: ts.toISOString(),
      device,
      raw: Array.from(data),
      ntc: p,
    }).catch((e) => setError((e as Error).message));
  };

  useEffect(() => {
    const offs = [
      ble.on('status', setStatus),
      ble.on('params', setParams),
      ble.on('snapshot', (data) => appendSnapshot(data, BLE_DEVICE_NAME)),
      ble.on('error', (e) => setError(e.message)),
    ];
    return () => { for (const off of offs) off(); };
  }, [ble]);

  useEffect(() => {
    const el = gaugesAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const rows = Math.max(1, Math.floor(entry.contentRect.height / ROW_HEIGHT));
      setTargetRows(rows);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const aggregationN = useMemo(
    () => pickAggregationN(snapshots.length, targetRows),
    [snapshots.length, targetRows],
  );

  const aggregated = useMemo(
    () => aggregateSnapshots(snapshots, aggregationN),
    [snapshots, aggregationN],
  );

  const handleConnect = async () => {
    setError(null);
    try { await ble.connect(); } catch (e) { setError((e as Error).message); }
  };
  const handleDisconnect = async () => { await ble.disconnect(); };
  const handleEmulate = () => setEmulating((v) => !v);

  useEffect(() => {
    if (!emulating) return;
    const ntc = paramsRef.current ?? DEFAULT_NTC_PARAMS;
    if (!paramsRef.current) setParams(ntc);
    const id = setInterval(() => {
      const data = new Uint16Array(ntc.sensors_cnt);
      const center = 2048;
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.max(0, Math.min(4095, center + Math.round((Math.random() - 0.5) * 1000)));
      }
      appendSnapshot(data, 'emulator');
    }, 1000);
    return () => clearInterval(id);
  }, [emulating]);

  return (
    <main>
      <h1>Prius Battery Monitor</h1>
      <Controls
        status={status}
        bleSupported={ble.isSupported()}
        emulating={emulating}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onEmulate={handleEmulate}
      />
      {error && <div class="error">Ошибка: {error}</div>}
      <div class="gauges-area" ref={gaugesAreaRef}>
        <Gauges snapshots={aggregated} params={params} />
      </div>
      <Legend />
    </main>
  );
}
