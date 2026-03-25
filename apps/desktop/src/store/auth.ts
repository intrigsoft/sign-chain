import { create } from 'zustand';

export interface AuthUser {
  sub: string;
  email: string;
  name: string | null;
  trust: string;
  verified: boolean;
}

interface AuthState {
  jwt: string | null;
  user: AuthUser | null;
  loading: boolean;
  setJwt: (token: string) => void;
  clearAuth: () => void;
  setLoading: (loading: boolean) => void;
}

function decodeJwtPayload(token: string): AuthUser | null {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json) as AuthUser;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  jwt: null,
  user: null,
  loading: true,

  setJwt: (token: string) => {
    const user = decodeJwtPayload(token);
    set({ jwt: token, user, loading: false });
  },

  clearAuth: () => set({ jwt: null, user: null, loading: false }),

  setLoading: (loading: boolean) => set({ loading }),
}));
