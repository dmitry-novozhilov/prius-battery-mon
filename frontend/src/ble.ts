export const BLE_DEVICE_NAME = 'PriusBattMon';
export const SERVICE_UUID = '9709c63e-d287-44fa-a0ef-59e3ffd6bc70';
export const CHAR_SNAPSHOT_UUID = '9709c63e-d287-44fa-a0ef-59e3ffd6bc71';
export const CHAR_NOTIFY_UUID = '9709c63e-d287-44fa-a0ef-59e3ffd6bc72';
export const CHAR_PARAMS_UUID = '9709c63e-d287-44fa-a0ef-59e3ffd6bc73';

export interface NtcParams {
  r0: number;
  t0: number;
  b: number;
  pullup: number;
  adc_bits: number;
  sensors_cnt: number;
}

export interface BleEvents {
  params: NtcParams;
  snapshot: Uint16Array;
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  error: Error;
}

type EventName = keyof BleEvents;
type Handler<E extends EventName> = (payload: BleEvents[E]) => void;
type AnyHandler = (payload: unknown) => void;

export class BleClient {
  private device: BluetoothDevice | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners = new Map<EventName, Set<AnyHandler>>();

  on<E extends EventName>(event: E, handler: Handler<E>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const h = handler as AnyHandler;
    set.add(h);
    return () => set!.delete(h);
  }

  private emit<E extends EventName>(event: E, payload: BleEvents[E]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of set) {
      try { (h as Handler<E>)(payload); } catch (e) { console.error(e); }
    }
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.bluetooth;
  }

  async connect(): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Bluetooth не поддерживается в этом браузере');
    }
    this.emit('status', 'connecting');

    const device = await navigator.bluetooth.requestDevice({
      filters: [{ name: BLE_DEVICE_NAME }],
      optionalServices: [SERVICE_UUID],
    });
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.onDisconnect);

    const server = await device.gatt!.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);

    const paramsChar = await service.getCharacteristic(CHAR_PARAMS_UUID);
    const paramsBuf = await paramsChar.readValue();
    const params = parseParams(paramsBuf);
    this.emit('params', params);

    this.notifyChar = await service.getCharacteristic(CHAR_NOTIFY_UUID);
    this.notifyChar.addEventListener('characteristicvaluechanged', this.onNotify);
    await this.notifyChar.startNotifications();

    this.emit('status', 'connected');
  }

  async disconnect(): Promise<void> {
    if (this.notifyChar) {
      try { await this.notifyChar.stopNotifications(); } catch { /* ignore */ }
      this.notifyChar.removeEventListener('characteristicvaluechanged', this.onNotify);
      this.notifyChar = null;
    }
    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.onDisconnect);
      if (this.device.gatt?.connected) this.device.gatt.disconnect();
      this.device = null;
    }
    this.emit('status', 'disconnected');
  }

  private onNotify = (event: Event): void => {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    const value = target.value;
    if (!value) return;
    this.emit('snapshot', parseSnapshot(value));
  };

  private onDisconnect = (): void => {
    this.notifyChar = null;
    this.emit('status', 'disconnected');
  };
}

export function parseSnapshot(view: DataView): Uint16Array {
  const count = Math.floor(view.byteLength / 2);
  const out = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    out[i] = view.getUint16(i * 2, /* littleEndian */ true);
  }
  return out;
}

export function parseParams(view: DataView): NtcParams {
  const text = new TextDecoder().decode(view.buffer);
  const obj = JSON.parse(text) as Partial<NtcParams>;
  for (const k of ['r0', 't0', 'b', 'pullup', 'adc_bits', 'sensors_cnt'] as const) {
    if (typeof obj[k] !== 'number') {
      throw new Error(`params: поле ${k} отсутствует или не число`);
    }
  }
  return obj as NtcParams;
}
