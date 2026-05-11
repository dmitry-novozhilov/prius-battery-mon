import { useEffect, useRef, useState } from 'preact/hooks';
import { BleClient, BLE_DEVICE_NAME, type NtcParams } from './ble';
import { DEFAULT_NTC_PARAMS } from './ntc';
import { postSnapshot } from './api';
import { Gauges } from './components/Gauges';
import { Controls } from './components/Controls';

export function App() {
  const bleRef = useRef<BleClient>();
  if (!bleRef.current) bleRef.current = new BleClient();
  const ble = bleRef.current;

  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [params, setParams] = useState<NtcParams | null>(null);
  const [raw, setRaw] = useState<Uint16Array | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emulating, setEmulating] = useState(false);

  const paramsRef = useRef<NtcParams | null>(null);
  paramsRef.current = params;

  useEffect(() => {
    const offs = [
      ble.on('status', setStatus),
      ble.on('params', setParams),
      ble.on('snapshot', (data) => {
        setRaw(data);
        const p = paramsRef.current;
        if (!p) return;
        postSnapshot({
          ts: new Date().toISOString(),
          device: BLE_DEVICE_NAME,
          raw: Array.from(data),
          ntc: p,
        }).catch((e) => setError((e as Error).message));
      }),
      ble.on('error', (e) => setError(e.message)),
    ];
    return () => { for (const off of offs) off(); };
  }, [ble]);

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
      setRaw(data);
      postSnapshot({
        ts: new Date().toISOString(),
        device: 'emulator',
        raw: Array.from(data),
        ntc,
      }).catch((e) => setError((e as Error).message));
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
      <Gauges raw={raw} params={params} />
    </main>
  );
}
