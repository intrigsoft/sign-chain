import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  extractRevision,
  openPdfPicker,
  verifyDocument,
  VerificationResult,
} from '../../lib/tauri';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

const CONTAINER_WIDTH = 640;

/** Inline PDF revision preview rendered via pdfjs canvases. */
function RevisionPreview({
  filePath,
  onClose,
}: {
  filePath: string;
  onClose: () => void;
}) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const url = `asset://localhost/${encodeURIComponent(filePath)}`;
    const loadingTask = pdfjs.getDocument(url);
    loadingTask.promise
      .then((doc) => {
        if (!cancelled) setPdfDoc(doc);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [filePath]);

  if (error) {
    return (
      <div style={{ marginTop: 12, color: '#ef4444', fontSize: 13 }}>
        Failed to load revision: {error}
      </div>
    );
  }

  if (!pdfDoc) {
    return (
      <div style={{ marginTop: 12, color: '#666', fontSize: 13 }}>
        Loading preview...
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#f9fafb',
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
          Revision Preview ({pdfDoc.numPages} page
          {pdfDoc.numPages !== 1 ? 's' : ''})
        </span>
        <button
          onClick={onClose}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            background: '#e5e7eb',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Close preview
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          maxHeight: 500,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {Array.from({ length: pdfDoc.numPages }, (_, i) => (
          <RevisionPage
            key={i}
            pdfDoc={pdfDoc}
            pageNumber={i + 1}
            containerWidth={CONTAINER_WIDTH - 24 /* padding */}
          />
        ))}
      </div>
    </div>
  );
}

/** Renders a single page of a revision PDF to a canvas, fit-to-width. */
function RevisionPage({
  pdfDoc,
  pageNumber,
  containerWidth,
}: {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: ReturnType<
      Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']
    > | null = null;

    pdfDoc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;

      const unscaled = page.getViewport({ scale: 1 });
      const scale = containerWidth / unscaled.width;
      const viewport = page.getViewport({ scale });

      setDims({ w: viewport.width, h: viewport.height });

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      renderTask.promise.catch(() => {
        /* cancelled */
      });
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, containerWidth]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: dims?.w ?? containerWidth,
        height: dims?.h ?? 200,
        background: '#fff',
        borderRadius: 4,
      }}
    />
  );
}

export default function VerifyPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const handlePickFile = async () => {
    setError(null);
    setResult(null);
    setPreviewPath(null);

    try {
      const path = await openPdfPicker();
      if (!path) return;

      setFilePath(path);
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

  const handleViewRevision = useCallback(
    async (signerIndex: number | null) => {
      if (!filePath) return;
      setPreviewLoading(true);
      try {
        const tempPath = await extractRevision(filePath, signerIndex);
        setPreviewPath(tempPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setPreviewLoading(false);
      }
    },
    [filePath],
  );

  const handleViewOriginal = useCallback(
    () => handleViewRevision(null),
    [handleViewRevision],
  );

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

          {/* View original button */}
          <button
            onClick={handleViewOriginal}
            disabled={previewLoading}
            style={{
              padding: '6px 14px',
              fontSize: 13,
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              cursor: previewLoading ? 'default' : 'pointer',
              marginBottom: 12,
              opacity: previewLoading ? 0.6 : 1,
            }}
          >
            View original
          </button>

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
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
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
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <button
                      onClick={() => handleViewRevision(i)}
                      disabled={previewLoading}
                      style={{
                        padding: '3px 10px',
                        fontSize: 12,
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: 4,
                        color: '#2563eb',
                        cursor: previewLoading ? 'default' : 'pointer',
                        opacity: previewLoading ? 0.6 : 1,
                      }}
                    >
                      View
                    </button>
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

          {/* Inline revision preview */}
          {previewPath && (
            <RevisionPreview
              filePath={previewPath}
              onClose={() => setPreviewPath(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
