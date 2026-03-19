import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SigningStep, useSigningStore } from '../../store/signing';
import PdfPreview from '../../components/PdfPreview';
import { saveSignedPdf } from '../../lib/tauri';

const STEPS: { key: SigningStep; label: string }[] = [
  { key: 'preparing', label: 'Preparing document...' },
  { key: 'embedding', label: 'Embedding signature...' },
  { key: 'hashing', label: 'Computing hash...' },
  { key: 'anchoring', label: 'Anchoring on-chain...' },
  { key: 'finalising', label: 'Finalising...' },
  { key: 'done', label: 'Done!' },
];

export default function SigningProgress() {
  const navigate = useNavigate();
  const { signingStep, signedPdfPath, error, reset } = useSigningStore();
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const currentIndex = STEPS.findIndex((s) => s.key === signingStep);
  const isDone = signingStep === 'done' && signedPdfPath;

  const handleSaveAs = async () => {
    if (!signedPdfPath) return;
    setSaving(true);
    try {
      const dest = await saveSignedPdf(signedPdfPath);
      if (dest) setSavedPath(dest);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDone = () => {
    reset();
    navigate('/dashboard');
  };

  // After signing is done, show preview + save
  if (isDone) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#fff',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 200,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ flex: 1 }}>
            <p style={{ color: '#16a34a', fontWeight: 600, fontSize: 16 }}>
              Document signed successfully!
            </p>
            {savedPath && (
              <p style={{ fontSize: 12, color: '#666', wordBreak: 'break-all' }}>
                Saved to: {savedPath}
              </p>
            )}
          </div>
          <button
            onClick={handleSaveAs}
            disabled={saving}
            style={{
              padding: '10px 20px',
              background: savedPath ? '#f3f4f6' : '#16a34a',
              color: savedPath ? '#374151' : '#fff',
              border: savedPath ? '1px solid #d1d5db' : 'none',
              borderRadius: 8,
              cursor: saving ? 'default' : 'pointer',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            {saving ? 'Saving...' : savedPath ? 'Save As...' : 'Save'}
          </button>
          <button
            onClick={handleDone}
            style={{
              padding: '10px 20px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              flexShrink: 0,
            }}
          >
            Done
          </button>
        </div>

        {/* PDF Preview */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#f9fafb',
            overflow: 'auto',
            padding: 24,
          }}
        >
          <PdfPreview filePath={signedPdfPath} />
        </div>
      </div>
    );
  }

  // While signing is in progress, show step list
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
    >
      <h2 style={{ fontSize: 24, marginBottom: 32 }}>Signing Document</h2>

      <div style={{ width: 400 }}>
        {STEPS.map((step, i) => {
          const isActive = step.key === signingStep;
          const stepDone = i < currentIndex || signingStep === 'done';
          const isPending = i > currentIndex && signingStep !== 'done';

          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                opacity: isPending ? 0.4 : 1,
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  background: stepDone ? '#16a34a' : isActive ? '#2563eb' : '#e5e7eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  flexShrink: 0,
                }}
              >
                {stepDone ? '\u2713' : i + 1}
              </div>
              <span
                style={{
                  fontWeight: isActive ? 600 : 400,
                  color: stepDone ? '#16a34a' : isActive ? '#111' : '#999',
                }}
              >
                {step.label}
              </span>
              {isActive && signingStep !== 'done' && (
                <span style={{ marginLeft: 'auto', fontSize: 12, color: '#999' }}>
                  ...
                </span>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div style={{ marginTop: 24, color: '#ef4444', fontSize: 14 }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}
