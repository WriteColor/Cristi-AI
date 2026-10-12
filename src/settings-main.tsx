import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import SettingsApp from './settings/SettingsApp';

const container = document.getElementById('settings-root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <SettingsApp />
    </React.StrictMode>
  );
}
