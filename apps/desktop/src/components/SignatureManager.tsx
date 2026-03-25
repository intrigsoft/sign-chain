import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLibraryStore } from '../store/library';
import SignatureCanvas from './SignatureCanvas';

type Tab = 'saved' | 'draw' | 'upload';

interface SignatureManagerProps {
  onSignatureSelected: (base64: string) => void;
}

export default function SignatureManager({ onSignatureSelected }: SignatureManagerProps) {
  const navigate = useNavigate();
  const { signatures, loaded, load, saveSignature, deleteSignature, loadSignatureBase64 } =
    useLibraryStore();
  const [activeTab, setActiveTab] = useState<Tab>(signatures.length > 0 ? 'saved' : 'draw');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawnBase64, setDrawnBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  // Switch to saved tab when signatures become available
  useEffect(() => {
    if (signatures.length > 0 && activeTab === 'draw' && !drawnBase64) {
      setActiveTab('saved');
    }
  }, [signatures.length]);

  const handleSelectSaved = async (id: string) => {
    setSelectedId(id);
    const base64 = await loadSignatureBase64(id);
    onSignatureSelected(base64);
  };

  const handleSaveDrawn = async () => {
    if (!drawnBase64) return;
    const id = await saveSignature(drawnBase64, `Signature ${signatures.length + 1}`);
    onSignatureSelected(drawnBase64);
    setSelectedId(id);
    setActiveTab('saved');
    setDrawnBase64(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
        const id = await saveSignature(pngBase64, file.name.replace(/\.\w+$/, ''));
        onSignatureSelected(pngBase64);
        setSelectedId(id);
        setActiveTab('saved');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base">Signature</h3>
        <button
          onClick={() => navigate('/library')}
          className="text-xs text-brand-700 bg-transparent border-none cursor-pointer hover:underline"
        >
          Manage Library
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4">
        <button onClick={() => setActiveTab('saved')} className={tabClass('saved')}>
          Saved ({signatures.length})
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
          {signatures.length === 0 ? (
            <p className="text-gray-400 text-sm">
              No saved signatures yet. Draw or upload one.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {signatures.map((sig) => (
                <SavedSignatureRow
                  key={sig.id}
                  id={sig.id}
                  label={sig.label}
                  cachedBase64={sig.base64}
                  selected={selectedId === sig.id}
                  onSelect={handleSelectSaved}
                  onDelete={() => {
                    deleteSignature(sig.id);
                    if (selectedId === sig.id) setSelectedId(null);
                  }}
                  onLoadBase64={loadSignatureBase64}
                />
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

function SavedSignatureRow({
  id,
  label,
  cachedBase64,
  selected,
  onSelect,
  onDelete,
  onLoadBase64,
}: {
  id: string;
  label: string;
  cachedBase64?: string;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: () => void;
  onLoadBase64: (id: string) => Promise<string>;
}) {
  const [base64, setBase64] = useState<string | null>(cachedBase64 ?? null);

  useEffect(() => {
    if (!base64) {
      onLoadBase64(id).then(setBase64).catch(() => {});
    }
  }, [id, base64, onLoadBase64]);

  return (
    <div
      onClick={() => onSelect(id)}
      className={`flex items-center gap-3 p-2 border-2 rounded-lg cursor-pointer ${
        selected
          ? 'border-brand-700 bg-brand-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="w-20 h-10 bg-gray-50 rounded flex items-center justify-center shrink-0">
        {base64 ? (
          <img
            src={`data:image/png;base64,${base64}`}
            alt={label}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <span className="text-gray-300 text-[10px]">...</span>
        )}
      </div>
      <span className="flex-1 text-[13px]">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="bg-transparent border-none text-red-500 cursor-pointer text-base px-1"
      >
        &times;
      </button>
    </div>
  );
}
