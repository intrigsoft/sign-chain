import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  openPdfPicker,
  verifyDocument,
  VerificationResult,
} from '../../lib/tauri';

export default function VerifyPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handlePickFile = async () => {
    setError(null);
    setResult(null);

    try {
      const path = await openPdfPicker();
      if (!path) return;

      setFileName(path.split(/[\\/]/).pop() ?? path);
      setLoading(true);

      const verifyResult = await verifyDocument(path);
      setResult(verifyResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          marginBottom: 16,
          color: '#2563eb',
          fontSize: 14,
        }}
      >
        &larr; Dashboard
      </button>

      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Verify Document</h1>
      <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
        Select a signed PDF to verify its signing chain integrity.
      </p>

      <button
        onClick={handlePickFile}
        disabled={loading}
        style={{
          padding: '12px 24px',
          fontSize: 14,
          background: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          cursor: loading ? 'default' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Verifying...' : 'Select PDF'}
      </button>

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            background: '#fef2f2',
            borderRadius: 8,
            color: '#ef4444',
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {result && !result.isSignchainDocument && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            background: '#f3f4f6',
            borderRadius: 8,
            color: '#374151',
            fontSize: 14,
          }}
        >
          This PDF does not contain SignChain metadata.
        </div>
      )}

      {result && result.isSignchainDocument && (
        <div style={{ marginTop: 24 }}>
          {/* Status banner */}
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              marginBottom: 20,
              fontSize: 14,
              fontWeight: 600,
              background: result.chainValid ? '#f0fdf4' : '#fef2f2',
              color: result.chainValid ? '#16a34a' : '#ef4444',
              border: `1px solid ${result.chainValid ? '#bbf7d0' : '#fecaca'}`,
            }}
          >
            {result.chainValid
              ? 'Document integrity verified'
              : 'Chain integrity broken'}
          </div>

          {fileName && (
            <p style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              {fileName}
            </p>
          )}

          {/* Signer list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {result.signers.map((s, i) => (
              <div
                key={i}
                style={{
                  padding: 16,
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#fff',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        fontSize: 16,
                        color: s.status === 'valid' ? '#16a34a' : '#ef4444',
                      }}
                    >
                      {s.status === 'valid' ? '\u2713' : '\u2717'}
                    </span>
                    <span style={{ fontWeight: 600 }}>
                      {s.signer}{' '}
                      <span style={{ fontWeight: 400, color: '#666' }}>
                        ({s.email})
                      </span>
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: s.status === 'valid' ? '#16a34a' : '#ef4444',
                    }}
                  >
                    {s.status === 'valid'
                      ? 'Valid'
                      : s.status === 'tampered'
                        ? 'Tampered'
                        : 'Unverifiable'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#999', marginLeft: 24 }}>
                  <div>Signed {new Date(s.timestamp).toLocaleString()}</div>
                  <div style={{ fontFamily: 'monospace', marginTop: 2 }}>
                    Hash: 0x{s.hash.slice(0, 8)}...{s.hash.slice(-8)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
