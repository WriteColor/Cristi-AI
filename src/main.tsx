import { CompanionRuntimeProvider } from './app/CompanionRuntimeProvider';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <CompanionRuntimeProvider><App /></CompanionRuntimeProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
