// Lightweight client error tracking. Reports uncaught errors to the API's
// /api/log endpoint, which logs them to Azure Application Insights (already
// enabled in api/host.json) — real observability with no external account.
//
// Future: to add Sentry, set VITE_SENTRY_DSN and init @sentry/browser here; this
// module is the single place that would change.
const ENDPOINT = '/api/log';

export function captureError(message: unknown, extra?: { stack?: string }) {
  const payload = {
    message: String((message as Error)?.message ?? message ?? 'error').slice(0, 1000),
    stack: String(extra?.stack ?? (message as Error)?.stack ?? '').slice(0, 4000),
    url: location.pathname,
    at: new Date().toISOString(),
  };
  try {
    // keepalive so it still sends during unload; failures are swallowed.
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let telemetry throw */
  }
}

// Install global handlers for uncaught errors and promise rejections.
export function initTelemetry() {
  window.addEventListener('error', (e) => captureError(e.message, { stack: e.error?.stack }));
  window.addEventListener('unhandledrejection', (e) =>
    captureError(`unhandledrejection: ${e.reason?.message ?? e.reason}`, { stack: e.reason?.stack }),
  );
}
