import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { usePdfScrollViewer } from '../hooks/usePdfScrollViewer';
import type { PageInfo } from '../hooks/usePdfScrollViewer';
import type { SignaturePlacement } from '../store/signing';
import PdfPageCanvas from './PdfPageCanvas';

interface SignaturePlacerProps {
  filePath: string;
  signatureBase64: string | null;
  placements: SignaturePlacement[];
  onPlacementAdded: (placement: SignaturePlacement) => void;
  onPlacementUpdated: (index: number, placement: SignaturePlacement) => void;
  onPlacementRemoved: (index: number) => void;
}

const MIN_SIZE = 40;

// ---------------------------------------------------------------------------
// QR placeholder (unchanged)
// ---------------------------------------------------------------------------
function QrPlaceholder({
  height,
  borderColor,
}: {
  height: number;
  borderColor: string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '100%',
        top: 0,
        width: height,
        height: height,
        marginLeft: 4,
        border: `2px dashed ${borderColor}`,
        borderRadius: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        color: borderColor,
        fontSize: 11,
        fontWeight: 600,
        opacity: 0.7,
      }}
    >
      QR
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------
function screenToPdf(
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  pageNumber: number,
  pageInfo: PageInfo,
  scale: number,
): SignaturePlacement {
  return {
    pageNumber,
    x: sx / scale,
    y: pageInfo.heightPts - (sy + sh) / scale,
    width: sw / scale,
    height: sh / scale,
  };
}

function pdfToScreen(
  p: SignaturePlacement,
  pageInfo: PageInfo,
  scale: number,
) {
  return {
    x: p.x * scale,
    y: (pageInfo.heightPts - p.y - p.height) * scale,
    w: p.width * scale,
    h: p.height * scale,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function SignaturePlacer({
  filePath,
  signatureBase64,
  placements,
  onPlacementAdded,
  onPlacementUpdated,
  onPlacementRemoved,
}: SignaturePlacerProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Measure scroll container for fit-to-width (clientWidth excludes scrollbar)
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setContainerWidth(el.clientWidth),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const {
    pdfDoc,
    pages,
    pageCount,
    loading,
    scale,
    zoomIn,
    zoomOut,
    resetZoom,
    setActualSize,
  } = usePdfScrollViewer(filePath, containerWidth);

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const [currentPage, setCurrentPage] = useState(1);

  // --- Scroll position preservation on zoom ---
  const scrollFraction = useRef(0);
  const prevScale = useRef(scale);

  // Capture fraction before scale changes
  useEffect(() => {
    if (scale !== prevScale.current) {
      const el = scrollRef.current;
      if (el && el.scrollHeight > 0) {
        scrollFraction.current = el.scrollTop / el.scrollHeight;
      }
      prevScale.current = scale;
    }
  }, [scale]);

  // Restore after DOM updates
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && scrollFraction.current > 0) {
      el.scrollTop = scrollFraction.current * el.scrollHeight;
    }
  }, [scale]);

  // --- Current page from scroll ---
  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container || pages.length === 0) return;

    const viewportCenter =
      container.scrollTop + container.clientHeight / 2;

    let closest = 1;
    let minDist = Infinity;
    pageRefs.current.forEach((el, pageNum) => {
      const top = el.offsetTop;
      const mid = top + el.offsetHeight / 2;
      const dist = Math.abs(mid - viewportCenter);
      if (dist < minDist) {
        minDist = dist;
        closest = pageNum;
      }
    });
    setCurrentPage(closest);
  }, [pages.length]);

  // --- Ctrl+scroll zoom (non-passive listener) ---
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn();
        else zoomOut();
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoomIn, zoomOut]);

  // --- Drop handler (per-page) ---
  const handlePageDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!signatureBase64) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [signatureBase64],
  );

  const makeDropHandler = useCallback(
    (pageInfo: PageInfo) => (e: React.DragEvent) => {
      if (!signatureBase64) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const w = 150;
      const h = 60;
      const x = Math.max(0, e.clientX - rect.left - w / 2);
      const y = Math.max(0, e.clientY - rect.top - h / 2);

      const placement = screenToPdf(
        x, y, w, h,
        pageInfo.pageNumber, pageInfo, scale,
      );
      onPlacementAdded(placement);
      setSelectedIndex(placements.length);
    },
    [signatureBase64, scale, onPlacementAdded, placements.length],
  );

  // --- Background click to deselect ---
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setSelectedIndex(null);
  }, []);

  // --- Move ---
  const handleMoveStart = (
    e: React.PointerEvent,
    screenPos: { x: number; y: number },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    dragOffset.current = {
      x: e.clientX - rect.left - screenPos.x,
      y: e.clientY - rect.top - screenPos.y,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleMoveMove = (
    e: React.PointerEvent,
    idx: number,
    screen: { x: number; y: number; w: number; h: number },
    pageInfo: PageInfo,
  ) => {
    if (!isDragging) return;
    const wrapper = e.currentTarget.parentElement as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    const maxW = pageInfo.widthPts * scale;
    const maxH = pageInfo.heightPts * scale;

    const x = Math.max(
      0,
      Math.min(maxW - screen.w, e.clientX - rect.left - dragOffset.current.x),
    );
    const y = Math.max(
      0,
      Math.min(maxH - screen.h, e.clientY - rect.top - dragOffset.current.y),
    );

    const placement = screenToPdf(
      x, y, screen.w, screen.h,
      pageInfo.pageNumber, pageInfo, scale,
    );
    onPlacementUpdated(idx, placement);
  };

  const handleMoveEnd = () => setIsDragging(false);

  // --- Resize ---
  const handleResizeStart = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizeMove = (
    e: React.PointerEvent,
    idx: number,
    screen: { x: number; y: number },
    pageInfo: PageInfo,
  ) => {
    if (!isResizing) return;
    const wrapper = e.currentTarget.parentElement as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    const maxW = pageInfo.widthPts * scale;
    const maxH = pageInfo.heightPts * scale;

    const newW = Math.max(
      MIN_SIZE,
      Math.min(maxW - screen.x, e.clientX - rect.left - screen.x),
    );
    const newH = Math.max(
      MIN_SIZE,
      Math.min(maxH - screen.y, e.clientY - rect.top - screen.y),
    );

    const placement = screenToPdf(
      screen.x, screen.y, newW, newH,
      pageInfo.pageNumber, pageInfo, scale,
    );
    onPlacementUpdated(idx, placement);
  };

  const handleResizeEnd = () => setIsResizing(false);

  // --- Render ---
  const zoomPercent = Math.round(scale * 100);

  return (
    <div
      ref={outerRef}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
    >
      {/* Zoom bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '6px 12px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fff',
          flexShrink: 0,
          fontSize: 13,
        }}
      >
        <button onClick={zoomOut} style={zoomBtnStyle}>
          −
        </button>
        <span style={{ minWidth: 48, textAlign: 'center' }}>
          {zoomPercent}%
        </span>
        <button onClick={zoomIn} style={zoomBtnStyle}>
          +
        </button>
        <span style={{ width: 1, height: 16, background: '#d1d5db' }} />
        <button onClick={setActualSize} style={zoomBtnStyle}>
          100%
        </button>
        <button onClick={resetZoom} style={zoomBtnStyle}>
          Fit Width
        </button>
        {pageCount > 1 && (
          <span style={{ marginLeft: 12, color: '#666' }}>
            Page {currentPage}/{pageCount}
          </span>
        )}
      </div>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={handleBackgroundClick}
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          padding: '12px 0',
          background: '#f9fafb',
        }}
      >
        {loading && (
          <p style={{ color: '#999', marginTop: 32 }}>Loading PDF...</p>
        )}
        {pdfDoc &&
          pages.map((pageInfo) => {
            const widthPx = pageInfo.widthPts * scale;
            const heightPx = pageInfo.heightPts * scale;

            // Placements for this page
            const pagePlacements = placements
              .map((p, idx) => ({ p, idx }))
              .filter(({ p }) => p.pageNumber === pageInfo.pageNumber)
              .map(({ p, idx }) => {
                const s = pdfToScreen(p, pageInfo, scale);
                return { idx, x: s.x, y: s.y, w: s.w, h: s.h };
              });

            return (
              <div
                key={pageInfo.pageNumber}
                ref={(el) => {
                  if (el) pageRefs.current.set(pageInfo.pageNumber, el);
                  else pageRefs.current.delete(pageInfo.pageNumber);
                }}
                onDragOver={handlePageDragOver}
                onDrop={makeDropHandler(pageInfo)}
                onClick={handleBackgroundClick}
                style={{
                  position: 'relative',
                  width: widthPx,
                  height: heightPx,
                  flexShrink: 0,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                  background: '#fff',
                }}
              >
                <PdfPageCanvas
                  pdfDoc={pdfDoc}
                  pageNumber={pageInfo.pageNumber}
                  scale={scale}
                  width={widthPx}
                  height={heightPx}
                />

                {/* Placement overlays */}
                {signatureBase64 &&
                  pagePlacements.map((cp) => {
                    const isSelected = selectedIndex === cp.idx;
                    const borderColor = isSelected ? '#2563eb' : '#16a34a';
                    const borderStyle = isSelected ? 'dashed' : 'solid';
                    const bgColor = isSelected
                      ? 'rgba(37,99,235,0.05)'
                      : 'rgba(22,163,74,0.08)';

                    return (
                      <div
                        key={cp.idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedIndex(cp.idx);
                        }}
                        onPointerDown={
                          isSelected
                            ? (e) => handleMoveStart(e, { x: cp.x, y: cp.y })
                            : undefined
                        }
                        onPointerMove={
                          isSelected && isDragging
                            ? (e) =>
                                handleMoveMove(e, cp.idx, cp, pageInfo)
                            : undefined
                        }
                        onPointerUp={
                          isSelected && isDragging ? handleMoveEnd : undefined
                        }
                        onPointerLeave={
                          isSelected && isDragging ? handleMoveEnd : undefined
                        }
                        style={{
                          position: 'absolute',
                          left: cp.x,
                          top: cp.y,
                          width: cp.w,
                          height: cp.h,
                          border: `2px ${borderStyle} ${borderColor}`,
                          borderRadius: 4,
                          background: bgColor,
                          cursor: isSelected ? 'move' : 'pointer',
                          userSelect: 'none',
                          touchAction: 'none',
                        }}
                      >
                        <img
                          src={`data:image/png;base64,${signatureBase64}`}
                          alt="Placed signature"
                          draggable={false}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none',
                          }}
                        />
                        <QrPlaceholder height={cp.h} borderColor={borderColor} />

                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlacementRemoved(cp.idx);
                              setSelectedIndex(null);
                            }}
                            style={{
                              position: 'absolute',
                              top: -10,
                              right: -10,
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: '#ef4444',
                              color: '#fff',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 12,
                              lineHeight: '20px',
                              textAlign: 'center',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            ×
                          </button>
                        )}

                        {isSelected && (
                          <div
                            onPointerDown={handleResizeStart}
                            onPointerMove={
                              isResizing
                                ? (e) =>
                                    handleResizeMove(
                                      e,
                                      cp.idx,
                                      { x: cp.x, y: cp.y },
                                      pageInfo,
                                    )
                                : undefined
                            }
                            onPointerUp={
                              isResizing ? handleResizeEnd : undefined
                            }
                            onPointerLeave={
                              isResizing ? handleResizeEnd : undefined
                            }
                            style={{
                              position: 'absolute',
                              right: -5,
                              bottom: -5,
                              width: 10,
                              height: 10,
                              background: '#2563eb',
                              borderRadius: 2,
                              cursor: 'nwse-resize',
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
      </div>
    </div>
  );
}

const zoomBtnStyle: React.CSSProperties = {
  padding: '2px 10px',
  fontSize: 14,
  background: '#f3f4f6',
  border: '1px solid #d1d5db',
  borderRadius: 4,
  cursor: 'pointer',
  lineHeight: '22px',
};
