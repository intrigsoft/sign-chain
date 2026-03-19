import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  width: number;
  height: number;
}

export default function PdfPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  width,
  height,
}: PdfPageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // IntersectionObserver for lazy rendering
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Render page when visible or scale changes
  useEffect(() => {
    if (!visible || !canvasRef.current) return;

    let cancelled = false;
    let renderTask: ReturnType<
      Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']
    > | null = null;

    pdfDoc.getPage(pageNumber).then((page) => {
      if (cancelled || !canvasRef.current) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      renderTask = page.render({ canvasContext: ctx, viewport });
      renderTask.promise.catch(() => {
        /* cancelled */
      });
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdfDoc, pageNumber, scale, visible]);

  return (
    <div
      ref={wrapperRef}
      style={{ width, height, flexShrink: 0 }}
    >
      {visible && (
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width, height }}
        />
      )}
    </div>
  );
}
