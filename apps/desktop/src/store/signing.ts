import { create } from 'zustand';

export interface UserIdentity {
  name: string;
  email: string;
  signerType: 'individual' | 'company';
  company?: string;
  position?: string;
}

export interface SavedSignature {
  id: string;
  base64: string;
  label: string;
  createdAt: number;
}

export interface SignaturePlacement {
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TextFieldType = 'text' | 'date';

export interface TextFieldPlacement {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fieldType: TextFieldType;
}

export type SigningStep =
  | 'idle'
  | 'preparing'
  | 'embedding'
  | 'hashing'
  | 'anchoring'
  | 'finalising'
  | 'done'
  | 'error';

interface SigningState {
  userIdentity: UserIdentity | null;
  geoCoords: { lat: number; lon: number } | null;
  savedSignatures: SavedSignature[];
  filePath: string | null;
  fileName: string | null;
  pageCount: number;
  signatureBase64: string | null;
  signaturePlacements: SignaturePlacement[];
  textFieldPlacements: TextFieldPlacement[];
  signingStep: SigningStep;
  signedPdfPath: string | null;
  error: string | null;
  openedFile: string | null;

  setUserIdentity: (identity: UserIdentity) => void;
  setGeoCoords: (coords: { lat: number; lon: number } | null) => void;
  addSavedSignature: (base64: string, label: string) => void;
  removeSavedSignature: (id: string) => void;
  setFile: (path: string, name: string, pageCount: number) => void;
  setSignature: (base64: string) => void;
  addSignaturePlacement: (placement: SignaturePlacement) => void;
  updateSignaturePlacement: (index: number, placement: SignaturePlacement) => void;
  removeSignaturePlacement: (index: number) => void;
  clearSignaturePlacements: () => void;
  addTextField: (field: TextFieldPlacement) => void;
  updateTextField: (id: string, updates: Partial<TextFieldPlacement>) => void;
  removeTextField: (id: string) => void;
  clearTextFields: () => void;
  setSigningStep: (step: SigningStep) => void;
  setSignedPdfPath: (path: string) => void;
  setError: (error: string) => void;
  setOpenedFile: (path: string | null) => void;
  reset: () => void;
}

const sessionInitialState = {
  filePath: null as string | null,
  fileName: null as string | null,
  pageCount: 0,
  signatureBase64: null as string | null,
  signaturePlacements: [] as SignaturePlacement[],
  textFieldPlacements: [] as TextFieldPlacement[],
  signingStep: 'idle' as SigningStep,
  signedPdfPath: null as string | null,
  error: null as string | null,
};

export const useSigningStore = create<SigningState>((set) => ({
  userIdentity: null,
  geoCoords: null,
  savedSignatures: [],
  openedFile: null,
  ...sessionInitialState,

  setUserIdentity: (identity) => set({ userIdentity: identity }),
  setGeoCoords: (coords) => set({ geoCoords: coords }),

  addSavedSignature: (base64, label) =>
    set((state) => ({
      savedSignatures: [
        ...state.savedSignatures,
        { id: crypto.randomUUID(), base64, label, createdAt: Date.now() },
      ],
    })),

  removeSavedSignature: (id) =>
    set((state) => ({
      savedSignatures: state.savedSignatures.filter((s) => s.id !== id),
    })),

  setFile: (path, name, pageCount) =>
    set({ filePath: path, fileName: name, pageCount }),

  setSignature: (base64) => set({ signatureBase64: base64 }),

  addSignaturePlacement: (placement) =>
    set((state) => ({
      signaturePlacements: [...state.signaturePlacements, placement],
    })),

  updateSignaturePlacement: (index, placement) =>
    set((state) => ({
      signaturePlacements: state.signaturePlacements.map((p, i) =>
        i === index ? placement : p,
      ),
    })),

  removeSignaturePlacement: (index) =>
    set((state) => ({
      signaturePlacements: state.signaturePlacements.filter((_, i) => i !== index),
    })),

  clearSignaturePlacements: () => set({ signaturePlacements: [] }),

  addTextField: (field) =>
    set((state) => ({
      textFieldPlacements: [...state.textFieldPlacements, field],
    })),

  updateTextField: (id, updates) =>
    set((state) => ({
      textFieldPlacements: state.textFieldPlacements.map((tf) =>
        tf.id === id ? { ...tf, ...updates } : tf,
      ),
    })),

  removeTextField: (id) =>
    set((state) => ({
      textFieldPlacements: state.textFieldPlacements.filter((tf) => tf.id !== id),
    })),

  clearTextFields: () => set({ textFieldPlacements: [] }),

  setSigningStep: (step) => set({ signingStep: step }),

  setSignedPdfPath: (path) => set({ signedPdfPath: path }),

  setError: (error) => set({ error, signingStep: 'error' }),

  setOpenedFile: (path) => set({ openedFile: path }),

  reset: () => set(sessionInitialState),
}));
