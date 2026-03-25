import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useAuthStore } from '../store/auth';
import { useSigningStore, UserIdentity } from '../store/signing';

export function useAuthInit() {
  const setJwt = useAuthStore((s) => s.setJwt);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setUserIdentity = useSigningStore((s) => s.setUserIdentity);

  useEffect(() => {
    // Load stored JWT + profile from keychain on mount
    Promise.all([
      invoke<string | null>('get_stored_jwt'),
      invoke<string | null>('get_stored_profile'),
    ])
      .then(([token, profileJson]) => {
        if (token) {
          setJwt(token);
        }
        if (profileJson) {
          try {
            const identity: UserIdentity = JSON.parse(profileJson);
            setUserIdentity(identity);
          } catch {
            // Corrupted profile — user will re-enter
          }
        }
        if (!token) {
          setLoading(false);
        }
      })
      .catch(() => {
        setLoading(false);
      });

    // Listen for deep link auth callbacks
    const unlisten = listen<string>('auth-callback', (event) => {
      const token = event.payload;
      if (token) {
        invoke('store_jwt', { token }).catch(() => {});
        setJwt(token);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setJwt, setLoading, setUserIdentity]);
}
