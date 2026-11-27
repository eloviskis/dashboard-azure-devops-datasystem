
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { RetroBoardPage } from './components/retro/RetroBoard.tsx';

// /retro/<token>: quadro da Retrô ao vivo, aberto pelo time sem login (o resto do app nem carrega).
const retroToken = window.location.pathname.match(/^\/retro\/([A-Za-z0-9_-]{20,100})\/?$/)?.[1];

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {retroToken ? <RetroBoardPage token={retroToken} /> : (
      <AuthProvider>
        <App />
      </AuthProvider>
    )}
  </React.StrictMode>
);