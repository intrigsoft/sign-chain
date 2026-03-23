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

  const tabClass = (tab: Tab) =>
    `py-2 px-4 text-[13px] border-none rounded-md cursor-pointer ${
      activeTab === tab
        ? 'bg-brand-700 text-white'
        : 'bg-gray-100 text-gray-700'
    }`;

  return (
    <div>
      <h3 className="text-base mb-3">Signature</h3>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setActiveTab('saved')} className={tabClass('saved')}>
          Saved ({savedSignatures.length})
        </button>
        <button onClick={() => setActiveTab('draw')} className={tabClass('draw')}>
          Draw
        </button>
        <button onClick={() => setActiveTab('upload')} className={tabClass('upload')}>
          Upload
        </button>
      </div>

      {/* Saved signatures */}
      {activeTab === 'saved' && (
        <div>
          {savedSignatures.length === 0 ? (
            <p className="text-gray-400 text-sm">
              No saved signatures yet. Draw or upload one.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {savedSignatures.map((sig) => (
                <div
                  key={sig.id}
                  onClick={() => handleSelectSaved(sig.id, sig.base64)}
                  className={`flex items-center gap-3 p-2 border-2 rounded-lg cursor-pointer ${
                    selectedId === sig.id
                      ? 'border-brand-700 bg-brand-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <img
                    src={`data:image/png;base64,${sig.base64}`}
                    alt={sig.label}
                    className="w-20 h-10 object-contain bg-gray-50 rounded"
                  />
                  <span className="flex-1 text-[13px]">{sig.label}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeSavedSignature(sig.id);
                      if (selectedId === sig.id) setSelectedId(null);
                    }}
                    className="bg-transparent border-none text-red-500 cursor-pointer text-base px-1"
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
            className={`mt-2 py-2 px-4 text-[13px] text-white border-none rounded-md ${
              drawnBase64
                ? 'bg-brand-700 cursor-pointer'
                : 'bg-gray-300 cursor-default'
            }`}
          >
            Save Signature
          </button>
        </div>
      )}

      {/* Upload tab */}
      {activeTab === 'upload' && (
        <div>
          <p className="text-gray-500 text-[13px] mb-3">
            Upload a PNG or JPG image of your signature.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="py-3 px-6 text-sm bg-brand-700 text-white border-none rounded-lg cursor-pointer"
          >
            Choose Image...
          </button>
        </div>
      )}
    </div>
  );
}
