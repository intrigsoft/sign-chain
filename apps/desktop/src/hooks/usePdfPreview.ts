import { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PageDimensions {
  width: number;
  height: number;
}

export function usePdfPreview(filePath: string | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pageDimensions, setPageDimensions] = useState<PageDimensions | null>(null);
  const [renderScale, setRenderScale] = useState(1);

  // Load PDF document
  useEffect(() => {
    if (!filePath) {
      setPdfDoc(null);
      setPageCount(0);
      setCurrentPage(1);
      setPageDimensions(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    // Use asset protocol for local files in Tauri
    const url = `asset://localhost/${encodeURIComponent(filePath)}`;
    const loadingTask = pdfjs.getDocument(url);

    loadingTask.promise
      .then((doc) => {
        if (cancelled) return;
        setPdfDoc(doc);
        setPageCount(doc.numPages);
        setCurrentPage(1);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load PDF:', err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      loadingTask.destroy();
    };
  }, [filePath]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let cancelled = false;

    pdfDoc.getPage(currentPage).then((page) => {
      if (cancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale: 1.0 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Expose PDF-point dimensions at scale 1.0
      setPageDimensions({ width: viewport.width, height: viewport.height });

      // Scale to fit container width (max 600px)
      const maxWidth = 600;
      const scale = Math.min(maxWidth / viewport.width, 1.5);
      setRenderScale(scale);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;

      page.render({ canvasContext: ctx, canvas, viewport: scaledViewport });
    });

    return () => {
      cancelled = true;
    };
  }, [pdfDoc, currentPage]);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= pageCount) {
        setCurrentPage(page);
      }
    },
    [pageCount]
  );

  const nextPage = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);
  const prevPage = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);

  return {
    canvasRef,
    currentPage,
    pageCount,
    loading,
    pageDimensions,
    renderScale,
    nextPage,
    prevPage,
    goToPage,
  };
}
