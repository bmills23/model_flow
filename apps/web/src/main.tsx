import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startProjectStore } from './project/store';
import './styles.css';
import './transport/transport.css';
import './vadose/vadose.css';
import './saturated/saturated.css';
import './risk/risk.css';
import './overrides/overrides.css';
import './chemicals/chemicals.css';
import './site/site.css';
import './guided/guided.css';
import './guided/exposure.css';
import './cleanup/cleanup.css';
import './vapor/vapor.css';
import './surfaceWater/surfaceWater.css';
import './household/household.css';
import './plantsEco/plantsEco.css';
import './report/report.css';

startProjectStore();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
