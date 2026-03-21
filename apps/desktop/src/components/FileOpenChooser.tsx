import { useNavigate } from 'react-router-dom';
import { useSigningStore } from '../store/signing';
import { getPdfPageCount } from '../lib/tauri';

/**
 * Modal shown when a PDF is opened via OS "Open With" / file association.
 * Lets the user choose to sign or verify the document.
 */
export default function FileOpenChooser() {
  const navigate = useNavigate();
  const openedFile = useSigningStore((s) => s.openedFile);
  const setOpenedFile = useSigningStore((s) => s.setOpenedFile);
  const setFile = useSigningStore((s) => s.setFile);
  const reset = useSigningStore((s) => s.reset);

  if (!openedFile) return null;

  const fileName = openedFile.split(/[/\\]/).pop() || openedFile;

  const handleSign = async () => {
    try {
      const count = await getPdfPageCount(openedFile);
      reset();
      setFile(openedFile, fileName, count);
      setOpenedFile(null);
      navigate('/sign');
    } catch (err) {
      console.error('Failed to open file for signing:', err);
      setOpenedFile(null);
    }
  };

  const handleVerify = () => {
    // Store the path for the verify page to pick up
    setOpenedFile(null);
    navigate('/verify', { state: { filePath: openedFile } });
  };

  const handleCancel = () => {
    setOpenedFile(null);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 32,
          maxWidth: 420,
          width: '100%',
          boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
        }}
      >
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Open PDF</h3>
        <p
          style={{
            color: '#666',
            fontSize: 14,
            marginBottom: 24,
            wordBreak: 'break-all',
          }}
        >
          {fileName}
        </p>
        <p style={{ color: '#374151', fontSize: 14, marginBottom: 20 }}>
          What would you like to do with this document?
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleSign}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              background: '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Sign with SignChain
          </button>
          <button
            onClick={handleVerify}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            Verify with SignChain
          </button>
          <button
            onClick={handleCancel}
            style={{
              padding: '12px 20px',
              fontSize: 14,
              background: '#f3f4f6',
              color: '#374151',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
