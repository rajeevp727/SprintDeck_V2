import { useCallback, useEffect, useRef, useState } from 'react';

export interface RealtimeChannel {
  connected: boolean;
  
  send: (data: unknown) => void;
}

export function useRealtime(
  group: string,
  participantId: string,
  onMessage: (data: unknown) => void,
): RealtimeChannel {
  const [connected, setConnected] = useState(false);
  const onMsg = useRef(onMessage);
  onMsg.current = onMessage;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!group || !participantId) return;
    let closed = false;
    let retry: number | undefined;

    async function connect() {
      try {
        const res = await fetch(
          `/api/negotiate?group=${encodeURIComponent(group)}&participantId=${encodeURIComponent(participantId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return; 
        const { url } = (await res.json()) as { url: string | null };
        if (!url || closed) return;
        const ws = new WebSocket(url, 'json.webpubsub.azure.v1');
        wsRef.current = ws;
        ws.onopen = () => {
          setConnected(true);
          onMsg.current({ t: 'changed' }); 
        };
        ws.onmessage = (e) => {
          let frame: { type?: string; data?: unknown };
          try {
            frame = JSON.parse(e.data);
          } catch {
            return;
          }
          if (frame.type === 'message') onMsg.current(frame.data);
        };
        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          if (!closed) retry = window.setTimeout(connect, 3000);
        };
        ws.onerror = () => {
          try {
            ws.close();
          } catch { void 0; }
        };
      } catch {
        if (!closed) retry = window.setTimeout(connect, 5000);
      }
    }
    connect();

    return () => {
      closed = true;
      if (retry) window.clearTimeout(retry);
      try {
        wsRef.current?.close();
      } catch { void 0; }
      wsRef.current = null;
    };
  }, [group, participantId]);

  const send = useCallback(
    (data: unknown) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'sendToGroup', group, dataType: 'json', data }));
        } catch { void 0; }
      }
    },
    [group],
  );

  return { connected, send };
}
