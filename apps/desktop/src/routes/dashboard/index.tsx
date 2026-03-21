import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pdfjs } from '../../lib/pdfjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useDocuments } from '../../hooks/useDocuments';
import {
  extractRevision,
  openPdfPicker,
  getPdfPageCount,
  verifyDocument,
  type VerificationResult,
} from '../../lib/tauri';
import { useSigningStore } from '../../store/signing';
import FileDropZone from '../../components/FileDropZone';
import { useTauriFileDrop, type DropZone } from '../../hooks/useTauriFileDrop';

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

  const containerWidth = 840; // fits within 900px max-width minus padding

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
            containerWidth={containerWidth - 24}
          />
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { data: documents, isLoading } = useDocuments();
  const setFile = useSigningStore((s) => s.setFile);

  const signRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyFileName, setVerifyFileName] = useState<string | null>(null);
  const [verifyFilePath, setVerifyFilePath] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // --- Sign flow ---
  const handleSignFiles = useCallback(
    async (paths: string[]) => {
      const pdf = paths.find((p) => p.toLowerCase().endsWith('.pdf'));
      if (!pdf) return;
      const count = await getPdfPageCount(pdf);
      const name = pdf.split(/[\\/]/).pop() ?? 'document.pdf';
      setFile(pdf, name, count);
      navigate('/upload');
    },
    [setFile, navigate],
  );

  const handleSignClick = useCallback(async () => {
    const path = await openPdfPicker();
    if (!path) return;
    await handleSignFiles([path]);
  }, [handleSignFiles]);

  // --- Verify flow ---
  const runVerification = useCallback(async (path: string) => {
    setVerifyError(null);
    setVerifyResult(null);
    setPreviewPath(null);
    setVerifyFilePath(path);
    setVerifyFileName(path.split(/[\\/]/).pop() ?? path);
    setVerifying(true);
    try {
      const result = await verifyDocument(path);
      setVerifyResult(result);
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  }, []);

  const handleViewRevision = useCallback(
    async (signerIndex: number | null) => {
      if (!verifyFilePath) return;
      setPreviewLoading(true);
      try {
        const tempPath = await extractRevision(verifyFilePath, signerIndex);
        setPreviewPath(tempPath);
      } catch (err) {
        setVerifyError(err instanceof Error ? err.message : String(err));
      } finally {
        setPreviewLoading(false);
      }
    },
    [verifyFilePath],
  );

  const handleViewOriginal = useCallback(
    () => handleViewRevision(null),
    [handleViewRevision],
  );

  const handleVerifyFiles = useCallback(
    (paths: string[]) => {
      const pdf = paths.find((p) => p.toLowerCase().endsWith('.pdf'));
      if (pdf) runVerification(pdf);
    },
    [runVerification],
  );

  const handleVerifyClick = useCallback(async () => {
    const path = await openPdfPicker();
    if (path) runVerification(path);
  }, [runVerification]);

  // --- Tauri file drop ---
  const zones: DropZone[] = [
    { ref: signRef, onDrop: handleSignFiles },
    { ref: verifyRef, onDrop: handleVerifyFiles },
  ];
  const { activeZoneIndex } = useTauriFileDrop(zones);

  return (
    <div style={{ padding: 32, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>SignChain</h1>

      {/* Drop zones */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 32 }}>
        <FileDropZone
          ref={signRef}
          icon="✏️"
          title="Sign Document"
          description="Drag & drop a PDF here to start signing"
          isHovering={activeZoneIndex === 0}
          onClick={handleSignClick}
        />
        <FileDropZone
          ref={verifyRef}
          icon="🔍"
          title="Verify Document"
          description="Drag & drop a PDF here to verify its signing chain"
          isHovering={activeZoneIndex === 1}
          onClick={handleVerifyClick}
          disabled={verifying}
        />
      </div>

      {/* Inline verification results */}
      {verifying && (
        <div
          style={{
            padding: 16,
            background: '#f3f4f6',
            borderRadius: 8,
            marginBottom: 24,
            fontSize: 14,
            color: '#374151',
          }}
        >
          Verifying {verifyFileName}...
        </div>
      )}

      {verifyError && (
        <div
          style={{
            padding: 12,
            background: '#fef2f2',
            borderRadius: 8,
            color: '#ef4444',
            fontSize: 13,
            marginBottom: 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{verifyError}</span>
          <button
            onClick={() => setVerifyError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Clear
          </button>
        </div>
      )}

      {verifyResult && (
        <div
          style={{
            marginBottom: 24,
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>
              Verification: {verifyFileName}
            </span>
            <button
              onClick={() => {
                setVerifyResult(null);
                setVerifyFileName(null);
                setVerifyFilePath(null);
                setPreviewPath(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: '#6b7280',
                cursor: 'pointer',
                fontSize: 13,
              }}
            >
              Clear
            </button>
          </div>

          <div style={{ padding: 16 }}>
            {!verifyResult.isSignchainDocument ? (
              <div style={{ color: '#374151', fontSize: 14 }}>
                This PDF does not contain SignChain metadata.
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 16,
                    fontSize: 14,
                    fontWeight: 600,
                    background: verifyResult.chainValid ? '#f0fdf4' : '#fef2f2',
                    color: verifyResult.chainValid ? '#16a34a' : '#ef4444',
                    border: `1px solid ${verifyResult.chainValid ? '#bbf7d0' : '#fecaca'}`,
                  }}
                >
                  {verifyResult.chainValid
                    ? 'Document integrity verified'
                    : 'Chain integrity broken'}
                </div>

                <button
                  onClick={handleViewOriginal}
                  disabled={previewLoading}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
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

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {verifyResult.signers.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        padding: 12,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <button
                            onClick={() => handleViewRevision(i)}
                            disabled={previewLoading}
                            style={{
                              padding: '2px 8px',
                              fontSize: 11,
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Recent documents */}
      <div>
        <h2 style={{ fontSize: 18, marginBottom: 12 }}>Recent Documents</h2>
        {isLoading && <p>Loading...</p>}
        {documents && documents.length === 0 && (
          <p style={{ color: '#666' }}>No documents yet. Upload a PDF to get started.</p>
        )}
        {documents?.map((doc) => (
          <div
            key={doc.id}
            onClick={() => navigate(`/document/${doc.id}`)}
            style={{
              padding: 12,
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              marginBottom: 8,
              cursor: 'pointer',
            }}
          >
            <strong>{doc.filename}</strong>
            <span style={{ marginLeft: 12, color: '#666' }}>{doc.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
