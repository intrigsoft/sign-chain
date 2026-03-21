import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSigningStore } from '../store/signing';
import { useFileOpen } from '../hooks/useFileOpen';
import FileOpenChooser from '../components/FileOpenChooser';

import IdentityPage from '../routes/identity';
import DashboardPage from '../routes/dashboard';
import UploadPage from '../routes/upload';
import SignPage from '../routes/sign';
import DocumentPage from '../routes/document';
import VerifyPage from '../routes/verify';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RequireIdentity({ children }: { children: React.ReactNode }) {
  const identity = useSigningStore((s) => s.userIdentity);
  if (!identity) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function FileOpenListener() {
  useFileOpen();
  return <FileOpenChooser />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FileOpenListener />
        <Routes>
          <Route path="/" element={<IdentityPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireIdentity>
                <DashboardPage />
              </RequireIdentity>
            }
          />
          <Route
            path="/upload"
            element={
              <RequireIdentity>
                <UploadPage />
              </RequireIdentity>
            }
          />
          <Route
            path="/sign"
            element={
              <RequireIdentity>
                <SignPage />
              </RequireIdentity>
            }
          />
          <Route
            path="/document/:id"
            element={
              <RequireIdentity>
                <DocumentPage />
              </RequireIdentity>
            }
          />
          <Route
            path="/verify"
            element={
              <RequireIdentity>
                <VerifyPage />
              </RequireIdentity>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

export default App;
