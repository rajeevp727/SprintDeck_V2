import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { initTheme } from './theme';
import { initTelemetry } from './telemetry';
import './styles.css';

initTheme(); // apply saved/system theme before first paint
initTelemetry(); // report uncaught errors to /api/log → App Insights

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
