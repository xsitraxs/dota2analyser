import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/unbounded/cyrillic-500.css';
import '@fontsource/unbounded/cyrillic-700.css';
import '@fontsource/unbounded/latin-500.css';
import '@fontsource/unbounded/latin-700.css';
import '@fontsource-variable/manrope';
import './index.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
