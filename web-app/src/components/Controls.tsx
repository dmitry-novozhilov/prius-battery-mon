interface Props {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  bleSupported: boolean;
  emulating: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onEmulate: () => void;
}

export function Controls({ status, bleSupported, emulating, onConnect, onDisconnect, onEmulate }: Props) {
  const connected = status === 'connected';
  return (
    <div class="controls">
      {!connected ? (
        <button onClick={onConnect} disabled={!bleSupported || status === 'connecting'}>
          {status === 'connecting' ? 'Подключение…' : 'Подключить BLE'}
        </button>
      ) : (
        <button onClick={onDisconnect}>Отключить</button>
      )}
      <button onClick={onEmulate}>
        {emulating ? 'Стоп эмуляция' : 'Эмуляция'}
      </button>
      <span class="status">{labelFor(status, bleSupported)}</span>
    </div>
  );
}

function labelFor(status: string, supported: boolean): string {
  if (!supported) return 'Web Bluetooth недоступен';
  switch (status) {
    case 'connecting': return 'подключение';
    case 'connected':  return 'подключено';
    case 'disconnected': return 'отключено';
    default: return 'готов';
  }
}
