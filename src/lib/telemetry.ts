

const ENDPOINT = '/api/log';

export function captureError(message: unknown, extra?: { stack?: string }) {
  const payload = {
    message: String((message as Error)?.message ?? message ?? 'error').slice(0, 1000),
    stack: String(extra?.stack ?? (message as Error)?.stack ?? '').slice(0, 4000),
    url: location.pathname,
    at: new Date().toISOString(),
  };
  try {

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch { void 0; }
}

export function initTelemetry() {
  window.addEventListener('error', (e) => captureError(e.message, { stack: e.error?.stack }));
  window.addEventListener('unhandledrejection', (e) =>
    captureError(`unhandledrejection: ${e.reason?.message ?? e.reason}`, { stack: e.reason?.stack }),
  );
}
