import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './transport/transport.css';
import './vadose/vadose.css';
import './saturated/saturated.css';
import './risk/risk.css';
import './cleanup/cleanup.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
