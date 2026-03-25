import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useLibraryStore,
  LibrarySignature,
  LibraryTextSnippet,
} from '../../store/library';
import { useAuthStore } from '../../store/auth';
import SignatureCanvas from '../../components/SignatureCanvas';
import CloudLibraryPrompt from '../../components/CloudLibraryPrompt';
import TitleBar from '../../components/TitleBar';

type Tab = 'signatures' | 'textSnippets';

export default function LibraryPage() {
  const navigate = useNavigate();
  const {
    signatures,
    textSnippets,
    loaded,
    load,
    saveSignature,
    deleteSignature,
    updateSignatureLabel,
    loadSignatureBase64,
    saveTextSnippet,
    updateTextSnippet,
    deleteTextSnippet,
    syncEnabled,
    syncing,
    setSyncEnabled,
    pushToCloud,
    disableAndDeleteCloud,
  } = useLibraryStore();

  const jwt = useAuthStore((s) => s.jwt);
  const [activeTab, setActiveTab] = useState<Tab>('signatures');
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const handleToggleSync = async () => {
    if (syncEnabled) {
      setShowDisableConfirm(true);
    } else {
      await setSyncEnabled(true);
      pushToCloud().catch(() => {});
    }
  };

  const handleConfirmDisable = async () => {
    setShowDisableConfirm(false);
    await disableAndDeleteCloud();
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <TitleBar />
      <CloudLibraryPrompt />
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto py-8 px-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                My Library
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage saved signatures and text snippets for quick reuse.
              </p>
            </div>
            <div className="flex items-center gap-4">
              {jwt && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <span className="text-xs text-gray-500">
                    {syncing ? 'Syncing...' : 'Cloud sync'}
                  </span>
                  <button
                    onClick={handleToggleSync}
                    disabled={syncing}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors border-none cursor-pointer ${
                      syncEnabled ? 'bg-brand-700' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        syncEnabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </label>
              )}
              <button
                onClick={() => navigate(-1)}
                className="text-sm text-brand-700 bg-transparent border-none cursor-pointer"
              >
                &larr; Back
              </button>
            </div>
          </div>

          {/* Disable sync confirmation */}
          {showDisableConfirm && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800 mb-3">
                This will delete your library data from the cloud. Your local
                library will not be affected.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmDisable}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white border-none rounded-md cursor-pointer"
                >
                  Disable &amp; Delete Cloud Data
                </button>
                <button
                  onClick={() => setShowDisableConfirm(false)}
                  className="px-3 py-1.5 text-xs bg-white text-gray-600 border border-gray-300 rounded-md cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setActiveTab('signatures')}
              className={`px-4 py-2.5 text-sm border-none bg-transparent cursor-pointer -mb-px ${
                activeTab === 'signatures'
                  ? 'border-b-2 border-b-brand-700 text-brand-700 font-medium'
                  : 'text-gray-500'
              }`}
            >
              Signatures ({signatures.length})
            </button>
            <button
              onClick={() => setActiveTab('textSnippets')}
              className={`px-4 py-2.5 text-sm border-none bg-transparent cursor-pointer -mb-px ${
                activeTab === 'textSnippets'
                  ? 'border-b-2 border-b-brand-700 text-brand-700 font-medium'
                  : 'text-gray-500'
              }`}
            >
              Text Snippets ({textSnippets.length})
            </button>
          </div>

          {activeTab === 'signatures' && (
            <SignaturesTab
              signatures={signatures}
              onSave={saveSignature}
              onDelete={deleteSignature}
              onUpdateLabel={updateSignatureLabel}
              onLoadBase64={loadSignatureBase64}
            />
          )}

          {activeTab === 'textSnippets' && (
            <TextSnippetsTab
              snippets={textSnippets}
              onSave={saveTextSnippet}
              onUpdate={updateTextSnippet}
              onDelete={deleteTextSnippet}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Signatures Tab ──────────────────────────────────────────

function SignaturesTab({
  signatures,
  onSave,
  onDelete,
  onUpdateLabel,
  onLoadBase64,
}: {
  signatures: LibrarySignature[];
  onSave: (base64: string, label: string) => Promise<string>;
  onDelete: (id: string) => Promise<void>;
  onUpdateLabel: (id: string, label: string) => Promise<void>;
  onLoadBase64: (id: string) => Promise<string>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'draw' | 'upload'>('draw');
  const [drawnBase64, setDrawnBase64] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  const handleSaveDrawn = async () => {
    if (!drawnBase64) return;
    const label = newLabel.trim() || `Signature ${signatures.length + 1}`;
    await onSave(drawnBase64, label);
    setShowAdd(false);
    setDrawnBase64(null);
    setNewLabel('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
        const label = newLabel.trim() || file.name.replace(/\.\w+$/, '');
        onSave(pngBase64, label);
        setShowAdd(false);
        setNewLabel('');
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleStartEdit = (sig: LibrarySignature) => {
    setEditingId(sig.id);
    setEditLabel(sig.label);
  };

  const handleFinishEdit = async () => {
    if (editingId && editLabel.trim()) {
      await onUpdateLabel(editingId, editLabel.trim());
    }
    setEditingId(null);
  };

  return (
    <div>
      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="mb-4 px-4 py-2 text-sm bg-brand-700 text-white border-none rounded-lg cursor-pointer hover:bg-brand-800"
        >
          + Add Signature
        </button>
      )}

      {showAdd && (
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">New Signature</h3>
            <button
              onClick={() => {
                setShowAdd(false);
                setDrawnBase64(null);
                setNewLabel('');
              }}
              className="text-gray-400 bg-transparent border-none cursor-pointer text-lg"
            >
              &times;
            </button>
          </div>

          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (e.g. My Initials, Full Signature)"
            className="w-full mb-3 px-3 py-2 text-sm border border-gray-300 rounded-md"
          />

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setAddMode('draw')}
              className={`px-3 py-1.5 text-xs rounded-md border cursor-pointer ${
                addMode === 'draw'
                  ? 'border-brand-700 bg-brand-50 text-brand-700'
                  : 'border-gray-300 bg-white text-gray-600'
              }`}
            >
              Draw
            </button>
            <button
              onClick={() => setAddMode('upload')}
              className={`px-3 py-1.5 text-xs rounded-md border cursor-pointer ${
                addMode === 'upload'
                  ? 'border-brand-700 bg-brand-50 text-brand-700'
                  : 'border-gray-300 bg-white text-gray-600'
              }`}
            >
              Upload Image
            </button>
          </div>

          {addMode === 'draw' && (
            <>
              <SignatureCanvas
                width={400}
                height={150}
                onSignature={(b64) => setDrawnBase64(b64)}
              />
              <button
                onClick={handleSaveDrawn}
                disabled={!drawnBase64}
                className={`mt-3 px-4 py-2 text-sm text-white border-none rounded-md ${
                  drawnBase64
                    ? 'bg-brand-700 cursor-pointer'
                    : 'bg-gray-300 cursor-default'
                }`}
              >
                Save
              </button>
            </>
          )}

          {addMode === 'upload' && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm bg-brand-700 text-white border-none rounded-md cursor-pointer"
              >
                Choose Image...
              </button>
            </>
          )}
        </div>
      )}

      {signatures.length === 0 && !showAdd && (
        <p className="text-gray-400 text-sm">
          No saved signatures. Add one to reuse across documents.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {signatures.map((sig) => (
          <SignatureRow
            key={sig.id}
            signature={sig}
            editing={editingId === sig.id}
            editLabel={editLabel}
            onEditLabelChange={setEditLabel}
            onStartEdit={() => handleStartEdit(sig)}
            onFinishEdit={handleFinishEdit}
            onDelete={() => onDelete(sig.id)}
            onLoadBase64={onLoadBase64}
          />
        ))}
      </div>
    </div>
  );
}

function SignatureRow({
  signature,
  editing,
  editLabel,
  onEditLabelChange,
  onStartEdit,
  onFinishEdit,
  onDelete,
  onLoadBase64,
}: {
  signature: LibrarySignature;
  editing: boolean;
  editLabel: string;
  onEditLabelChange: (v: string) => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onDelete: () => void;
  onLoadBase64: (id: string) => Promise<string>;
}) {
  const [base64, setBase64] = useState<string | null>(
    signature.base64 ?? null,
  );

  useEffect(() => {
    if (!base64) {
      onLoadBase64(signature.id).then(setBase64).catch(() => {});
    }
  }, [signature.id, base64, onLoadBase64]);

  return (
    <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
      <div className="w-24 h-12 bg-gray-50 rounded flex items-center justify-center shrink-0">
        {base64 ? (
          <img
            src={`data:image/png;base64,${base64}`}
            alt={signature.label}
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <span className="text-gray-300 text-xs">Loading...</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={editLabel}
            onChange={(e) => onEditLabelChange(e.target.value)}
            onBlur={onFinishEdit}
            onKeyDown={(e) => e.key === 'Enter' && onFinishEdit()}
            className="text-sm px-2 py-1 border border-brand-300 rounded w-full"
          />
        ) : (
          <span
            onClick={onStartEdit}
            className="text-sm text-gray-800 cursor-pointer hover:text-brand-700"
          >
            {signature.label}
          </span>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {new Date(signature.createdAt).toLocaleDateString()}
        </p>
      </div>

      <button
        onClick={onDelete}
        className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer text-sm px-2"
      >
        Delete
      </button>
    </div>
  );
}

// ── Text Snippets Tab ───────────────────────────────────────

function TextSnippetsTab({
  snippets,
  onSave,
  onUpdate,
  onDelete,
}: {
  snippets: LibraryTextSnippet[];
  onSave: (label: string, text: string, fontSize: number) => Promise<string>;
  onUpdate: (
    id: string,
    label: string,
    text: string,
    fontSize: number,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const [newFontSize, setNewFontSize] = useState(12);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editText, setEditText] = useState('');
  const [editFontSize, setEditFontSize] = useState(12);

  const handleSave = async () => {
    if (!newText.trim()) return;
    const label = newLabel.trim() || newText.trim().slice(0, 30);
    await onSave(label, newText.trim(), newFontSize);
    setShowAdd(false);
    setNewLabel('');
    setNewText('');
    setNewFontSize(12);
  };

  const handleStartEdit = (sn: LibraryTextSnippet) => {
    setEditingId(sn.id);
    setEditLabel(sn.label);
    setEditText(sn.text);
    setEditFontSize(sn.fontSize);
  };

  const handleFinishEdit = async () => {
    if (editingId && editText.trim()) {
      await onUpdate(
        editingId,
        editLabel.trim() || editText.trim().slice(0, 30),
        editText.trim(),
        editFontSize,
      );
    }
    setEditingId(null);
  };

  return (
    <div>
      {!showAdd && (
        <button
          onClick={() => setShowAdd(true)}
          className="mb-4 px-4 py-2 text-sm bg-brand-700 text-white border-none rounded-lg cursor-pointer hover:bg-brand-800"
        >
          + Add Text Snippet
        </button>
      )}

      {showAdd && (
        <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium">New Text Snippet</h3>
            <button
              onClick={() => {
                setShowAdd(false);
                setNewLabel('');
                setNewText('');
              }}
              className="text-gray-400 bg-transparent border-none cursor-pointer text-lg"
            >
              &times;
            </button>
          </div>

          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Label (e.g. Full Name, Address, Company)"
            className="w-full mb-2 px-3 py-2 text-sm border border-gray-300 rounded-md"
          />
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Text content (e.g. John Doe, 123 Main St)"
            rows={2}
            className="w-full mb-2 px-3 py-2 text-sm border border-gray-300 rounded-md resize-none"
          />
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs text-gray-600">Font size:</label>
            <select
              value={newFontSize}
              onChange={(e) => setNewFontSize(Number(e.target.value))}
              className="px-2 py-1 text-sm border border-gray-300 rounded"
            >
              {[8, 10, 12, 14, 16, 18].map((s) => (
                <option key={s} value={s}>
                  {s}pt
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleSave}
            disabled={!newText.trim()}
            className={`px-4 py-2 text-sm text-white border-none rounded-md ${
              newText.trim()
                ? 'bg-brand-700 cursor-pointer'
                : 'bg-gray-300 cursor-default'
            }`}
          >
            Save
          </button>
        </div>
      )}

      {snippets.length === 0 && !showAdd && (
        <p className="text-gray-400 text-sm">
          No saved text snippets. Add reusable text like your name, address, or
          company.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {snippets.map((sn) => (
          <div
            key={sn.id}
            className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200"
          >
            <div className="flex-1 min-w-0">
              {editingId === sn.id ? (
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="Label"
                    className="text-sm px-2 py-1 border border-brand-300 rounded"
                  />
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    rows={2}
                    className="text-sm px-2 py-1 border border-brand-300 rounded resize-none"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={editFontSize}
                      onChange={(e) =>
                        setEditFontSize(Number(e.target.value))
                      }
                      className="px-2 py-1 text-xs border border-gray-300 rounded"
                    >
                      {[8, 10, 12, 14, 16, 18].map((s) => (
                        <option key={s} value={s}>
                          {s}pt
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={handleFinishEdit}
                      className="px-3 py-1 text-xs bg-brand-700 text-white border-none rounded cursor-pointer"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-600 border-none rounded cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-xs text-gray-400 uppercase tracking-wide">
                    {sn.label}
                  </span>
                  <p className="text-sm text-gray-800 mt-0.5">{sn.text}</p>
                  <span className="text-xs text-gray-400">{sn.fontSize}pt</span>
                </>
              )}
            </div>

            {editingId !== sn.id && (
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleStartEdit(sn)}
                  className="text-gray-400 hover:text-brand-700 bg-transparent border-none cursor-pointer text-sm px-2"
                >
                  Edit
                </button>
                <button
                  onClick={() => onDelete(sn.id)}
                  className="text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer text-sm px-2"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
