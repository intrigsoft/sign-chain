import { MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSigningStore } from '../store/signing';
import { useAuthStore } from '../store/auth';
import { useAuthInit } from '../hooks/useAuthInit';
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const jwt = useAuthStore((s) => s.jwt);
  const loading = useAuthStore((s) => s.loading);
  const identity = useSigningStore((s) => s.userIdentity);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-gray-400 text-sm">Loading...</div>
      </div>
    );
  }

  if (!jwt || !identity) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function FileOpenListener() {
  useFileOpen();
  return <FileOpenChooser />;
}

function AuthInitializer({ children }: { children: React.ReactNode }) {
  useAuthInit();
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <MemoryRouter>
          <FileOpenListener />
          <Routes>
            <Route path="/" element={<IdentityPage />} />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path="/upload"
              element={
                <RequireAuth>
                  <UploadPage />
                </RequireAuth>
              }
            />
            <Route
              path="/sign"
              element={
                <RequireAuth>
                  <SignPage />
                </RequireAuth>
              }
            />
            <Route
              path="/document/:id"
              element={
                <RequireAuth>
                  <DocumentPage />
                </RequireAuth>
              }
            />
            <Route
              path="/verify"
              element={
                <RequireAuth>
                  <VerifyPage />
                </RequireAuth>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthInitializer>
    </QueryClientProvider>
  );
}

export default App;
