import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './contexts/AuthContext';
import { AuthGate } from './components/auth/AuthGate';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AuthGate>
        {({ perfil, onSair }) => <App perfil={perfil} onSair={onSair} />}
      </AuthGate>
    </AuthProvider>
  </StrictMode>,
);
