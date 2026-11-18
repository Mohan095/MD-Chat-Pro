import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/variables.css';
import './styles/global.css';
import './styles/auth.css';
import './styles/chat.css';

const container = document.getElementById('root');
const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
