import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { AuthGate } from '@/components/AuthGate';
import { DemoBadge } from '@/components/DemoBadge';
import { Toaster } from '@/components/ui/sonner';
import { AuthProvider } from '@/hooks/useAuth';
import { DEMO } from '@/lib/demoMode';
import App from './App';

const onError = (e: Error) => toast.error(e.message);
const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthGate>
          <HashRouter>
            <App />
          </HashRouter>
        </AuthGate>
        <Toaster />
        {DEMO && <DemoBadge />}
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
