import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import '@fontsource-variable/jost';
import '@fontsource-variable/cormorant';
import './styles.css';
import App from './App.jsx';
import { AppStateProvider } from './lib/AppState.jsx';
import { applySettings } from './lib/settings.js';

// Theme, contrast, text size and motion are applied before the first paint.
applySettings();

// Caches the app so it installs to the home screen and opens offline.
registerSW({ immediate: true });

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
