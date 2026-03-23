import { useCallback, useEffect, useState } from 'react';
import { pdfjs } from '../lib/pdfjs';

export interface PageInfo {
  pageNumber: number;
  widthPts: number;
  heightPts: number;
}

export interface PdfScrollViewerResult {
  pdfDoc: pdfjs.PDFDocumentProxy | null;
  pages: PageInfo[];
  pageCount: number;
  loading: boolean;
  scale: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  setActualSize: () => void;
}

const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;
const ZOOM_FACTOR = 1.25;

export function usePdfScrollViewer(
  filePath: string | null,
  containerWidth: number,
): PdfScrollViewerResult {
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PageInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [userScale, setUserScale] = useState<number | null>(null);

  // Load PDF and collect page dimensions
  useEffect(() => {
    if (!filePath) {
      setPdfDoc(null);
      setPages([]);
      setUserScale(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const url = `asset://localhost/${encodeURIComponent(filePath)}`;
    const loadingTask = pdfjs.getDocument(url);

    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        const infos: PageInfo[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: 1.0 });
          infos.push({
            pageNumber: i,
            widthPts: vp.width,
            heightPts: vp.height,
          });
        }
        if (cancelled) return;
        setPdfDoc(doc);
        setPages(infos);
        setUserScale(null);
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

  // Fit-to-width scale
  const maxPageWidth =
    pages.length > 0 ? Math.max(...pages.map((p) => p.widthPts)) : 1;
  const fitScale =
    containerWidth > 0 ? containerWidth / maxPageWidth : 1;

  const scale = userScale ?? fitScale;

  const zoomIn = useCallback(() => {
    setUserScale((prev) => {
      const base = prev ?? fitScale;
      return Math.min(MAX_SCALE, base * ZOOM_FACTOR);
    });
  }, [fitScale]);

  const zoomOut = useCallback(() => {
    setUserScale((prev) => {
      const base = prev ?? fitScale;
      return Math.max(MIN_SCALE, base / ZOOM_FACTOR);
    });
  }, [fitScale]);

  const resetZoom = useCallback(() => {
    setUserScale(null);
  }, []);

  const setActualSize = useCallback(() => {
    setUserScale(1.0);
  }, []);

  return {
    pdfDoc,
    pages,
    pageCount: pages.length,
    loading,
    scale,
    zoomIn,
    zoomOut,
    resetZoom,
    setActualSize,
  };
}
