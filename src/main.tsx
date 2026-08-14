import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import AuthProviders from './components/AuthProviders';
import ErrorBoundary from './components/ErrorBoundary';
import { initTheme } from './lib/theme';
import { initPerf } from './lib/perf';
import { initTelemetry } from './lib/telemetry';
import './styles.css';

initTheme(); 
initPerf(); 
initTelemetry(); 

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProviders>
        <App />
      </AuthProviders>
    </ErrorBoundary>
  </StrictMode>,
);
