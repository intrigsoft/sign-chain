import { useNavigate } from 'react-router-dom';
import { openPdfPicker, getPdfPageCount } from '../../lib/tauri';
import { useSigningStore } from '../../store/signing';
import PdfPreview from '../../components/PdfPreview';

export default function UploadPage() {
  const navigate = useNavigate();
  const { filePath, fileName, pageCount, setFile } = useSigningStore();

  const handleBrowse = async () => {
    const path = await openPdfPicker();
    if (!path) return;

    const count = await getPdfPageCount(path);
    const name = path.split(/[\\/]/).pop() ?? 'document.pdf';
    setFile(path, name, count);
  };

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      {/* Left panel */}
      <div
        style={{
          width: 320,
          padding: 24,
          borderRight: '1px solid #e5e7eb',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            marginBottom: 24,
            textAlign: 'left',
            color: '#2563eb',
          }}
        >
          &larr; Back
        </button>

        <h2 style={{ fontSize: 20, marginBottom: 16 }}>Upload PDF</h2>

        <button
          onClick={handleBrowse}
          style={{
            padding: '12px 24px',
            fontSize: 14,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            marginBottom: 16,
          }}
        >
          Browse...
        </button>

        {fileName && (
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontWeight: 600 }}>{fileName}</p>
            <p style={{ color: '#666', fontSize: 14 }}>{pageCount} page(s)</p>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={() => navigate('/sign')}
          disabled={!filePath}
          style={{
            padding: '12px 24px',
            fontSize: 14,
            background: filePath ? '#2563eb' : '#ccc',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: filePath ? 'pointer' : 'default',
          }}
        >
          Continue &rarr;
        </button>
      </div>

      {/* Right panel — PDF preview */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f9fafb',
          overflow: 'auto',
        }}
      >
        {filePath ? (
          <PdfPreview filePath={filePath} />
        ) : (
          <p style={{ color: '#999' }}>Select a PDF to preview</p>
        )}
      </div>
    </div>
  );
}
