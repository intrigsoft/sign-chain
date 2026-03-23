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
      className="block bg-white rounded"
      style={{
        width: dims?.w ?? containerWidth,
        height: dims?.h ?? 200,
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
      <div className="mt-3 text-red-500 text-[13px]">
        Failed to load revision: {error}
      </div>
    );
  }

  if (!pdfDoc) {
    return (
      <div className="mt-3 text-gray-500 text-[13px]">
        Loading preview...
      </div>
    );
  }

  const containerWidth = 840;

  return (
    <div className="mt-4 border border-gray-200 rounded-lg bg-gray-50 p-3">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[13px] font-semibold text-gray-700">
          Revision Preview ({pdfDoc.numPages} page
          {pdfDoc.numPages !== 1 ? 's' : ''})
        </span>
        <button
          onClick={onClose}
          className="px-3 py-1 text-xs bg-gray-200 border-none rounded-md cursor-pointer"
        >
          Close preview
        </button>
      </div>
      <div className="max-h-[500px] overflow-y-auto flex flex-col gap-2">
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
    <div className="p-8 max-w-[900px] mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <img src="/logo.png" alt="SignChain" className="h-8" />
      </div>

      {/* Drop zones */}
      <div className="flex gap-4 mb-8">
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
        <div className="p-4 bg-gray-100 rounded-lg mb-6 text-sm text-gray-700">
          Verifying {verifyFileName}...
        </div>
      )}

      {verifyError && (
        <div className="p-3 bg-red-50 rounded-lg text-red-500 text-[13px] mb-6 flex justify-between items-center">
          <span>{verifyError}</span>
          <button
            onClick={() => setVerifyError(null)}
            className="bg-transparent border-none text-red-500 cursor-pointer text-[13px] font-semibold"
          >
            Clear
          </button>
        </div>
      )}

      {verifyResult && (
        <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
          <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-200">
            <span className="text-sm font-semibold">
              Verification: {verifyFileName}
            </span>
            <button
              onClick={() => {
                setVerifyResult(null);
                setVerifyFileName(null);
                setVerifyFilePath(null);
                setPreviewPath(null);
              }}
              className="bg-transparent border-none text-gray-500 cursor-pointer text-[13px]"
            >
              Clear
            </button>
          </div>

          <div className="p-4">
            {!verifyResult.isSignchainDocument ? (
              <div className="text-gray-700 text-sm">
                This PDF does not contain SignChain metadata.
              </div>
            ) : (
              <>
                <div
                  className={`p-3 rounded-lg mb-4 text-sm font-semibold border ${
                    verifyResult.chainValid
                      ? 'bg-green-50 text-green-600 border-green-200'
                      : 'bg-red-50 text-red-500 border-red-200'
                  }`}
                >
                  {verifyResult.chainValid
                    ? 'Document integrity verified'
                    : 'Chain integrity broken'}
                </div>

                <button
                  onClick={handleViewOriginal}
                  disabled={previewLoading}
                  className={`px-3 py-1.5 text-xs bg-gray-100 border border-gray-300 rounded-md mb-3 ${
                    previewLoading ? 'cursor-default opacity-60' : 'cursor-pointer'
                  }`}
                >
                  View original
                </button>

                <div className="flex flex-col gap-2">
                  {verifyResult.signers.map((s, i) => (
                    <div
                      key={i}
                      className="p-3 border border-gray-200 rounded-lg bg-white"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-base ${
                              s.status === 'valid' ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {s.status === 'valid' ? '\u2713' : '\u2717'}
                          </span>
                          <span className="font-semibold">
                            {s.signer}{' '}
                            <span className="font-normal text-gray-500">
                              ({s.email})
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleViewRevision(i)}
                            disabled={previewLoading}
                            className={`px-2 py-0.5 text-[11px] bg-brand-50 border border-brand-200 rounded text-brand-700 ${
                              previewLoading ? 'cursor-default opacity-60' : 'cursor-pointer'
                            }`}
                          >
                            View
                          </button>
                          <span
                            className={`text-xs font-semibold ${
                              s.status === 'valid' ? 'text-green-600' : 'text-red-500'
                            }`}
                          >
                            {s.status === 'valid'
                              ? 'Valid'
                              : s.status === 'tampered'
                                ? 'Tampered'
                                : 'Unverifiable'}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-400 ml-6">
                        <div>Signed {new Date(s.timestamp).toLocaleString()}</div>
                        <div className="font-mono mt-0.5">
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
        <h2 className="text-lg mb-3">Recent Documents</h2>
        {isLoading && <p>Loading...</p>}
        {documents && documents.length === 0 && (
          <p className="text-gray-500">No documents yet. Upload a PDF to get started.</p>
        )}
        {documents?.map((doc) => (
          <div
            key={doc.id}
            onClick={() => navigate(`/document/${doc.id}`)}
            className="p-3 border border-gray-200 rounded-lg mb-2 cursor-pointer"
          >
            <strong>{doc.filename}</strong>
            <span className="ml-3 text-gray-500">{doc.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
