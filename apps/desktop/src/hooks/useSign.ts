import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { signDocument } from '../lib/tauri';
import { SigningStep, useSigningStore } from '../store/signing';

const STATUS_MAP: Record<string, SigningStep> = {
  preparing: 'preparing',
  embedding: 'embedding',
  hashing: 'hashing',
  anchoring: 'anchoring',
  finalising: 'finalising',
  done: 'done',
};

export function useSign() {
  const {
    filePath,
    signatureBase64,
    signaturePlacements,
    userIdentity,
    signingStep,
    setSigningStep,
    setSignedPdfPath,
    setError,
  } = useSigningStore();

  // Listen for signing status events from Rust
  useEffect(() => {
    const unlisten = listen<string>('signing:status', (event) => {
      const step = STATUS_MAP[event.payload];
      if (step) {
        setSigningStep(step);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [setSigningStep]);

  const startSigning = async () => {
    if (!filePath || !signatureBase64 || signaturePlacements.length === 0 || !userIdentity) return;

    setSigningStep('preparing');

    try {
      const outputPath = await signDocument(
        filePath,
        signatureBase64,
        userIdentity.name,
        userIdentity.email,
        signaturePlacements
      );
      setSignedPdfPath(outputPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    signingStep,
    startSigning,
    isSigningInProgress:
      signingStep !== 'idle' &&
      signingStep !== 'done' &&
      signingStep !== 'error',
  };
}
