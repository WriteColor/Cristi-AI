import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import CameraApp from './camera/CameraApp';

const container = document.getElementById('camera-root');
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <CameraApp />
    </React.StrictMode>
  );
}
