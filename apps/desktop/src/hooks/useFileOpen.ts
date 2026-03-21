import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useSigningStore } from '../store/signing';

/**
 * Listens for the `file-open` event emitted by the Rust backend
 * when the OS opens a PDF via "Open With" / file association.
 * Stores the path so the app can show an action chooser.
 */
export function useFileOpen() {
  const setOpenedFile = useSigningStore((s) => s.setOpenedFile);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<string>('file-open', (event) => {
      setOpenedFile(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [setOpenedFile]);
}
