import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { api } from '../lib/api';
import { useAuthStore } from './auth';

export interface LibrarySignature {
  id: string;
  label: string;
  filename: string;
  createdAt: number;
  /** Populated on demand when the user selects or views it */
  base64?: string;
}

export interface LibraryTextSnippet {
  id: string;
  label: string;
  text: string;
  fontSize: number;
  createdAt: number;
}

interface CloudLibrary {
  signatures: {
    id: string;
    label: string;
    base64Png: string;
    updatedAt: string;
  }[];
  textSnippets: {
    id: string;
    label: string;
    text: string;
    fontSize: number;
    updatedAt: string;
  }[];
}

interface LibraryState {
  signatures: LibrarySignature[];
  textSnippets: LibraryTextSnippet[];
  loaded: boolean;

  // Sync state
  syncEnabled: boolean;
  syncing: boolean;
  lastSyncedAt: number | null;

  load: () => Promise<void>;
  saveSignature: (base64: string, label: string) => Promise<string>;
  deleteSignature: (id: string) => Promise<void>;
  updateSignatureLabel: (id: string, label: string) => Promise<void>;
  loadSignatureBase64: (id: string) => Promise<string>;
  saveTextSnippet: (
    label: string,
    text: string,
    fontSize: number,
  ) => Promise<string>;
  updateTextSnippet: (
    id: string,
    label: string,
    text: string,
    fontSize: number,
  ) => Promise<void>;
  deleteTextSnippet: (id: string) => Promise<void>;

  // Sync actions
  setSyncEnabled: (enabled: boolean) => Promise<void>;
  pushToCloud: (opts?: {
    deletedSigIds?: string[];
    deletedSnippetIds?: string[];
  }) => Promise<void>;
  pullFromCloud: () => Promise<void>;
  checkCloudLibrary: () => Promise<boolean>;
  disableAndDeleteCloud: () => Promise<void>;
}

let pushDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedPush(store: LibraryState, opts?: Parameters<LibraryState['pushToCloud']>[0]) {
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  pushDebounceTimer = setTimeout(() => {
    store.pushToCloud(opts).catch(() => {});
  }, 500);
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  signatures: [],
  textSnippets: [],
  loaded: false,
  syncEnabled: false,
  syncing: false,
  lastSyncedAt: null,

  load: async () => {
    const [data, syncEnabled] = await Promise.all([
      invoke<{
        signatures: LibrarySignature[];
        textSnippets: LibraryTextSnippet[];
      }>('load_library'),
      invoke<boolean>('get_sync_enabled'),
    ]);
    set({
      signatures: data.signatures,
      textSnippets: data.textSnippets,
      syncEnabled,
      loaded: true,
    });
  },

  saveSignature: async (base64, label) => {
    const id = crypto.randomUUID();
    await invoke('save_library_signature', { id, label, base64Png: base64 });
    set((s) => ({
      signatures: [
        ...s.signatures,
        {
          id,
          label,
          filename: `${id}.png`,
          createdAt: Date.now(),
          base64,
        },
      ],
    }));
    const state = get();
    if (state.syncEnabled && useAuthStore.getState().jwt) {
      debouncedPush(state);
    }
    return id;
  },

  deleteSignature: async (id) => {
    await invoke('delete_library_signature', { id });
    set((s) => ({
      signatures: s.signatures.filter((sig) => sig.id !== id),
    }));
    const state = get();
    if (state.syncEnabled && useAuthStore.getState().jwt) {
      debouncedPush(state, { deletedSigIds: [id] });
    }
  },

  updateSignatureLabel: async (id, label) => {
    await invoke('update_library_signature_label', { id, label });
    set((s) => ({
      signatures: s.signatures.map((sig) =>
        sig.id === id ? { ...sig, label } : sig,
      ),
    }));
    const state = get();
    if (state.syncEnabled && useAuthStore.getState().jwt) {
      debouncedPush(state);
    }
  },

  loadSignatureBase64: async (id) => {
    const sigs = get().signatures;
    const existing = sigs.find((s) => s.id === id);
    if (existing?.base64) return existing.base64;

    const base64 = await invoke<string>('load_library_signature', { id });
    set((s) => ({
      signatures: s.signatures.map((sig) =>
        sig.id === id ? { ...sig, base64 } : sig,
      ),
    }));
    return base64;
  },

  saveTextSnippet: async (label, text, fontSize) => {
    const id = crypto.randomUUID();
    await invoke('save_text_snippet', { id, label, text, fontSize });
    set((s) => ({
      textSnippets: [
        ...s.textSnippets,
        { id, label, text, fontSize, createdAt: Date.now() },
      ],
    }));
    const state = get();
    if (state.syncEnabled && useAuthStore.getState().jwt) {
      debouncedPush(state);
    }
    return id;
  },

  updateTextSnippet: async (id, label, text, fontSize) => {
    await invoke('save_text_snippet', { id, label, text, fontSize });
    set((s) => ({
      textSnippets: s.textSnippets.map((sn) =>
        sn.id === id ? { ...sn, label, text, fontSize } : sn,
      ),
    }));
    const state = get();
    if (state.syncEnabled && useAuthStore.getState().jwt) {
      debouncedPush(state);
    }
  },

  deleteTextSnippet: async (id) => {
    await invoke('delete_text_snippet', { id });
    set((s) => ({
      textSnippets: s.textSnippets.filter((sn) => sn.id !== id),
    }));
    const state = get();
    if (state.syncEnabled && useAuthStore.getState().jwt) {
      debouncedPush(state, { deletedSnippetIds: [id] });
    }
  },

  setSyncEnabled: async (enabled) => {
    await invoke('set_sync_enabled', { enabled });
    set({ syncEnabled: enabled });
  },

  pushToCloud: async (opts) => {
    const state = get();
    if (state.syncing) return;
    set({ syncing: true });

    try {
      // Load base64 for all signatures
      const sigPayloads = await Promise.all(
        state.signatures.map(async (sig) => {
          const base64 =
            sig.base64 ||
            (await invoke<string>('load_library_signature', { id: sig.id }));
          return {
            id: sig.id,
            label: sig.label,
            base64Png: base64,
            updatedAt: new Date(sig.createdAt).toISOString(),
          };
        }),
      );

      const snippetPayloads = state.textSnippets.map((sn) => ({
        id: sn.id,
        label: sn.label,
        text: sn.text,
        fontSize: sn.fontSize,
        updatedAt: new Date(sn.createdAt).toISOString(),
      }));

      await api.put('/library/sync', {
        signatures: sigPayloads,
        textSnippets: snippetPayloads,
        deletedSignatureIds: opts?.deletedSigIds ?? [],
        deletedSnippetIds: opts?.deletedSnippetIds ?? [],
      });

      set({ lastSyncedAt: Date.now() });
    } catch {
      // Silent failure on network errors
    } finally {
      set({ syncing: false });
    }
  },

  pullFromCloud: async () => {
    set({ syncing: true });
    try {
      const cloud = await api.get<CloudLibrary>('/library');

      // Write each signature locally
      for (const sig of cloud.signatures) {
        await invoke('save_library_signature', {
          id: sig.id,
          label: sig.label,
          base64Png: sig.base64Png,
        });
      }

      // Write each text snippet locally
      for (const sn of cloud.textSnippets) {
        await invoke('save_text_snippet', {
          id: sn.id,
          label: sn.label,
          text: sn.text,
          fontSize: sn.fontSize,
        });
      }

      // Reload from disk
      const data = await invoke<{
        signatures: LibrarySignature[];
        textSnippets: LibraryTextSnippet[];
      }>('load_library');

      set({
        signatures: data.signatures,
        textSnippets: data.textSnippets,
        lastSyncedAt: Date.now(),
      });
    } finally {
      set({ syncing: false });
    }
  },

  checkCloudLibrary: async () => {
    try {
      const result = await api.get<{ exists: boolean }>('/library/exists');
      return result.exists;
    } catch {
      return false;
    }
  },

  disableAndDeleteCloud: async () => {
    await invoke('set_sync_enabled', { enabled: false });
    set({ syncEnabled: false });
    try {
      await api.delete('/library');
    } catch {
      // Silent failure
    }
    set({ lastSyncedAt: null });
  },
}));
