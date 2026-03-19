import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSigningStore } from '../../store/signing';
import { useSign } from '../../hooks/useSign';
import SignatureManager from '../../components/SignatureManager';
import SignaturePlacer from '../../components/SignaturePlacer';
import SigningProgress from './SigningProgress';

export default function SignPage() {
  const navigate = useNavigate();
  const {
    filePath,
    fileName,
    signatureBase64,
    signaturePlacements,
    error,
    setSignature,
    addSignaturePlacement,
    updateSignaturePlacement,
    removeSignaturePlacement,
    clearSignaturePlacements,
  } = useSigningStore();
  const { signingStep, startSigning } = useSign();
  const [showConfirm, setShowConfirm] = useState(false);

  if (signingStep !== 'idle' && signingStep !== 'error') {
    return <SigningProgress />;
  }

  const canSign = filePath && signatureBase64 && signaturePlacements.length > 0;

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left panel — Signature Manager */}
      <div
        style={{
          width: 320,
          padding: 24,
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'auto',
        }}
      >
        <button
          onClick={() => navigate('/upload')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginBottom: 16,
            textAlign: 'left',
            color: '#2563eb',
          }}
        >
          &larr; Back
        </button>

        <h2 style={{ fontSize: 20, marginBottom: 4 }}>Sign Document</h2>
        <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>{fileName}</p>

        <SignatureManager
          onSignatureSelected={(base64) => {
            setSignature(base64);
            clearSignaturePlacements();
          }}
        />

        {/* Draggable signature thumbnail */}
        {signatureBase64 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
              Drag to place on PDF
            </p>
            <div
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', 'signature');
                e.dataTransfer.effectAllowed = 'copy';
              }}
              style={{
                border: '2px dashed #2563eb',
                borderRadius: 8,
                padding: 8,
                cursor: 'grab',
                background: '#f0f4ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={`data:image/png;base64,${signatureBase64}`}
                alt="Drag signature"
                draggable={false}
                style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain' }}
              />
            </div>
          </div>
        )}

        {/* Placement list */}
        {signaturePlacements.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4 style={{ fontSize: 14, marginBottom: 8, color: '#374151' }}>
              Placements ({signaturePlacements.length})
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {signaturePlacements.map((p, i) => (
                <li
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    fontSize: 13,
                    background: '#f3f4f6',
                    borderRadius: 6,
                    marginBottom: 4,
                  }}
                >
                  <span>Page {p.pageNumber}</span>
                  <button
                    onClick={() => removeSignaturePlacement(i)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 13,
                      padding: '2px 6px',
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {signatureBase64 && (
          <p style={{ color: '#999', fontSize: 12, marginTop: 8 }}>
            {signaturePlacements.length === 0
              ? 'Drag your signature onto the PDF to place it.'
              : 'Click a placement to move, resize, or delete it.'}
          </p>
        )}

        {/* Sign button */}
        <button
          onClick={() => setShowConfirm(true)}
          disabled={!canSign}
          style={{
            padding: '12px 24px',
            fontSize: 14,
            background: canSign ? '#16a34a' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: canSign ? 'pointer' : 'default',
            marginTop: 12,
          }}
        >
          Sign &amp; Anchor
        </button>

        {error && (
          <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', borderRadius: 8, color: '#ef4444', fontSize: 13 }}>
            Error: {error}
          </div>
        )}
      </div>

      {/* Right panel — PDF with signature placement */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          background: '#f9fafb',
          overflow: 'hidden',
          padding: 0,
        }}
      >
        {filePath ? (
          <SignaturePlacer
            filePath={filePath}
            signatureBase64={signatureBase64}
            placements={signaturePlacements}
            onPlacementAdded={addSignaturePlacement}
            onPlacementUpdated={updateSignaturePlacement}
            onPlacementRemoved={removeSignaturePlacement}
          />
        ) : (
          <p style={{ color: '#999' }}>No document loaded</p>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              padding: 32,
              maxWidth: 400,
              width: '100%',
            }}
          >
            <h3 style={{ marginBottom: 12 }}>Confirm Signing</h3>
            <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
              This will embed your signature at {signaturePlacements.length} location
              {signaturePlacements.length !== 1 ? 's' : ''}, compute a hash, and
              anchor it on-chain. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  padding: '8px 20px',
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  startSigning();
                }}
                style={{
                  padding: '8px 20px',
                  background: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
