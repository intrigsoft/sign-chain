import { useRef, useState } from 'react';
import { useSigningStore } from '../store/signing';
import SignatureCanvas from './SignatureCanvas';

type Tab = 'saved' | 'draw' | 'upload';

interface SignatureManagerProps {
  onSignatureSelected: (base64: string) => void;
}

export default function SignatureManager({ onSignatureSelected }: SignatureManagerProps) {
  const { savedSignatures, addSavedSignature, removeSavedSignature } = useSigningStore();
  const [activeTab, setActiveTab] = useState<Tab>(savedSignatures.length > 0 ? 'saved' : 'draw');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawnBase64, setDrawnBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSelectSaved = (id: string, base64: string) => {
    setSelectedId(id);
    onSignatureSelected(base64);
  };

  const handleSaveDrawn = () => {
    if (!drawnBase64) return;
    addSavedSignature(drawnBase64, `Signature ${savedSignatures.length + 1}`);
    onSignatureSelected(drawnBase64);
    setActiveTab('saved');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Convert to PNG via canvas for consistency
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
        addSavedSignature(pngBase64, file.name);
        onSignatureSelected(pngBase64);
        setActiveTab('saved');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);

    // Reset so same file can be re-uploaded
    e.target.value = '';
  };

  const tabStyle = (tab: Tab) => ({
    padding: '8px 16px',
    fontSize: 13,
    background: activeTab === tab ? '#2563eb' : '#f3f4f6',
    color: activeTab === tab ? '#fff' : '#333',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer' as const,
  });

  return (
    <div>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>Signature</h3>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        <button onClick={() => setActiveTab('saved')} style={tabStyle('saved')}>
          Saved ({savedSignatures.length})
        </button>
        <button onClick={() => setActiveTab('draw')} style={tabStyle('draw')}>
          Draw
        </button>
        <button onClick={() => setActiveTab('upload')} style={tabStyle('upload')}>
          Upload
        </button>
      </div>

      {/* Saved signatures */}
      {activeTab === 'saved' && (
        <div>
          {savedSignatures.length === 0 ? (
            <p style={{ color: '#999', fontSize: 14 }}>
              No saved signatures yet. Draw or upload one.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {savedSignatures.map((sig) => (
                <div
                  key={sig.id}
                  onClick={() => handleSelectSaved(sig.id, sig.base64)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 8,
                    border: `2px solid ${selectedId === sig.id ? '#2563eb' : '#e5e7eb'}`,
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: selectedId === sig.id ? '#eff6ff' : '#fff',
                  }}
                >
                  <img
                    src={`data:image/png;base64,${sig.base64}`}
                    alt={sig.label}
                    style={{
                      width: 80,
                      height: 40,
                      objectFit: 'contain',
                      background: '#f9fafb',
                      borderRadius: 4,
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 13 }}>{sig.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedSignature(sig.id);
                      if (selectedId === sig.id) setSelectedId(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#ef4444',
                      cursor: 'pointer',
                      fontSize: 16,
                      padding: '0 4px',
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Draw tab */}
      {activeTab === 'draw' && (
        <div>
          <SignatureCanvas
            width={280}
            height={120}
            onSignature={(base64) => setDrawnBase64(base64)}
          />
          <button
            onClick={handleSaveDrawn}
            disabled={!drawnBase64}
            style={{
              marginTop: 8,
              padding: '8px 16px',
              fontSize: 13,
              background: drawnBase64 ? '#2563eb' : '#ccc',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: drawnBase64 ? 'pointer' : 'default',
            }}
          >
            Save Signature
          </button>
        </div>
      )}

      {/* Upload tab */}
      {activeTab === 'upload' && (
        <div>
          <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>
            Upload a PNG or JPG image of your signature.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              padding: '12px 24px',
              fontSize: 14,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Choose Image...
          </button>
        </div>
      )}
    </div>
  );
}
