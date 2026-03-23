import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { pdfjs } from '../../lib/pdfjs';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  extractRevision,
  openPdfPicker,
  verifyDocument,
  VerificationResult,
} from '../../lib/tauri';

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

  return (
    <div className="mt-4 border border-gray-200 rounded-lg bg-gray-50 p-3">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[13px] font-semibold text-gray-700">
          Revision Preview ({pdfDoc.numPages} page
          {pdfDoc.numPages !== 1 ? 's' : ''})
        </span>
        <button
          onClick={onClose}
          className="px-3 py-1 text-xs bg-gray-200 border-none rounded-md cursor-pointer hover:bg-gray-300"
        >
          Close preview
        </button>
      </div>
      <div
        ref={containerRef}
        className="max-h-[500px] overflow-y-auto flex flex-col gap-2"
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
      className="block bg-white rounded"
      style={{
        width: dims?.w ?? containerWidth,
        height: dims?.h ?? 200,
      }}
    />
  );
}

export default function VerifyPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Auto-verify if opened via "Open With" / file association
  useEffect(() => {
    const state = location.state as { filePath?: string } | null;
    if (state?.filePath) {
      const path = state.filePath;
      setFilePath(path);
      setFileName(path.split(/[\\/]/).pop() ?? path);
      setLoading(true);
      verifyDocument(path)
        .then((r) => setResult(r))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="p-8 max-w-[640px] mx-auto">
      <button
        onClick={() => navigate('/dashboard')}
        className="bg-transparent border-none cursor-pointer mb-4 text-brand-700 text-sm"
      >
        &larr; Dashboard
      </button>

      <h1 className="text-2xl mb-2">Verify Document</h1>
      <p className="text-gray-500 mb-6 text-sm">
        Select a signed PDF to verify its signing chain integrity.
      </p>

      <button
        onClick={handlePickFile}
        disabled={loading}
        className={`px-6 py-3 text-sm text-white border-none rounded-lg cursor-pointer bg-brand-700 ${
          loading ? 'opacity-60 cursor-default' : 'hover:bg-brand-800'
        }`}
      >
        {loading ? 'Verifying...' : 'Select PDF'}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg text-red-500 text-[13px]">
          {error}
        </div>
      )}

      {result && !result.isSignchainDocument && (
        <div className="mt-6 p-4 bg-gray-100 rounded-lg text-gray-700 text-sm">
          This PDF does not contain SignChain metadata.
        </div>
      )}

      {result && result.isSignchainDocument && (
        <div className="mt-6">
          {/* Status banner */}
          <div
            className={`p-3 rounded-lg mb-5 text-sm font-semibold border ${
              result.chainValid
                ? 'bg-green-50 text-green-600 border-green-200'
                : 'bg-red-50 text-red-500 border-red-200'
            }`}
          >
            {result.chainValid
              ? 'Document integrity verified'
              : 'Chain integrity broken'}
          </div>

          {fileName && (
            <p className="text-[13px] text-gray-500 mb-4">
              {fileName}
            </p>
          )}

          {/* View original button */}
          <button
            onClick={handleViewOriginal}
            disabled={previewLoading}
            className={`px-3.5 py-1.5 text-[13px] bg-gray-100 border border-gray-300 rounded-md mb-3 ${
              previewLoading ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-gray-200'
            }`}
          >
            View original
          </button>

          {/* Signer list */}
          <div className="flex flex-col gap-2">
            {result.signers.map((s, i) => (
              <div
                key={i}
                className="p-4 border border-gray-200 rounded-lg bg-white"
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
                      className={`px-2.5 py-0.5 text-xs bg-brand-50 border border-brand-200 rounded text-brand-700 ${
                        previewLoading ? 'opacity-60 cursor-default' : 'cursor-pointer hover:bg-brand-100'
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
                    Hash: {s.hash.slice(0, 10)}...{s.hash.slice(-7)}
                  </div>
                  {s.blockchainVerified !== null && s.blockchainVerified !== undefined && (
                    <div
                      className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold border ${
                        s.blockchainVerified
                          ? 'bg-green-50 text-green-600 border-green-200'
                          : 'bg-red-50 text-red-500 border-red-200'
                      }`}
                    >
                      {s.blockchainVerified ? '\u26D3 Blockchain verified' : '\u26A0 Blockchain mismatch'}
                    </div>
                  )}
                  {s.blockchainVerified === null && (
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-600 border border-amber-200">
                      Blockchain status unavailable (offline or legacy signature)
                    </div>
                  )}
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
