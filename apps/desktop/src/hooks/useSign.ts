import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { signDocument, TauriTextFieldPlacement } from '../lib/tauri';
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
    textFieldPlacements,
    userIdentity,
    geoCoords,
    signingStep,
    setSigningStep,
    setSignedPdfPath,
    setError,
    setGeoCoords,
  } = useSigningStore();

  // Request geolocation on mount
  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setGeoCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          // User denied or error — geo stays null (optional field)
        }
      );
    }
  }, [setGeoCoords]);

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
      const textFieldsForRust: TauriTextFieldPlacement[] = textFieldPlacements
        .filter((tf) => tf.text.trim().length > 0)
        .map(({ id, ...rest }) => rest);

      const outputPath = await signDocument(
        filePath,
        signatureBase64,
        userIdentity.name,
        userIdentity.email,
        userIdentity.signerType,
        userIdentity.company,
        userIdentity.position,
        geoCoords?.lat,
        geoCoords?.lon,
        signaturePlacements,
        textFieldsForRust
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
