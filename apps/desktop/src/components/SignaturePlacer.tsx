import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { usePdfScrollViewer } from '../hooks/usePdfScrollViewer';
import type { PageInfo } from '../hooks/usePdfScrollViewer';
import type {
  SignaturePlacement,
  TextFieldPlacement,
  TextFieldType,
} from '../store/signing';
import PdfPageCanvas from './PdfPageCanvas';

interface SignaturePlacerProps {
  filePath: string;
  signatureBase64: string | null;
  placements: SignaturePlacement[];
  onPlacementAdded: (placement: SignaturePlacement) => void;
  onPlacementUpdated: (index: number, placement: SignaturePlacement) => void;
  onPlacementRemoved: (index: number) => void;
  placementMode: 'signature' | 'textField';
  textFields: TextFieldPlacement[];
  pendingFieldType: TextFieldType;
  pendingFontSize: number;
  onTextFieldAdded: (field: TextFieldPlacement) => void;
  onTextFieldUpdated: (id: string, updates: Partial<TextFieldPlacement>) => void;
  onTextFieldRemoved: (id: string) => void;
}

const MIN_SIZE = 40;
const MIN_FIELD_WIDTH = 60;
// Must match embed.rs: placement.height.max(34.0)
const QR_MIN_PT = 34;

// ---------------------------------------------------------------------------
// QR placeholder (unchanged)
// ---------------------------------------------------------------------------
function QrPlaceholder({
  sigHeight,
  scale,
  borderColor,
}: {
  sigHeight: number;
  scale: number;
  borderColor: string;
}) {
  // Match Rust: qr_size = placement.height.max(34.0), placed 4pt right
  const qrSize = Math.max(sigHeight, QR_MIN_PT * scale);
  return (
    <div
      style={{
        position: 'absolute',
        left: '100%',
        top: 0,
        width: qrSize,
        height: qrSize,
        marginLeft: 4 * scale,
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
  p: { x: number; y: number; width: number; height: number },
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
  placementMode,
  textFields,
  pendingFieldType,
  pendingFontSize,
  onTextFieldAdded,
  onTextFieldUpdated,
  onTextFieldRemoved,
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

  // Selection state: only one thing selected at a time
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);

  const selectSignature = useCallback((idx: number) => {
    setSelectedIndex(idx);
    setSelectedFieldId(null);
  }, []);

  const selectTextField = useCallback((id: string) => {
    setSelectedFieldId(id);
    setSelectedIndex(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIndex(null);
    setSelectedFieldId(null);
  }, []);

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isDraggingField, setIsDraggingField] = useState(false);
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

  // --- Drop handler (per-page) for signatures and text fields ---
  const handlePageDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    },
    [],
  );

  const makeDropHandler = useCallback(
    (pageInfo: PageInfo) => (e: React.DragEvent) => {
      e.preventDefault();
      const dragType = e.dataTransfer.getData('text/plain');
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

      if (dragType === 'signature' && signatureBase64) {
        const w = 150;
        const h = 60;
        const x = Math.max(0, e.clientX - rect.left - w / 2);
        const y = Math.max(0, e.clientY - rect.top - h / 2);

        const placement = screenToPdf(
          x, y, w, h,
          pageInfo.pageNumber, pageInfo, scale,
        );
        onPlacementAdded(placement);
        selectSignature(placements.length);
      } else if (dragType === 'textField') {
        const defaultW = 200;
        const defaultH = pendingFontSize * 1.8;
        const x = Math.max(0, e.clientX - rect.left - defaultW / 2);
        const y = Math.max(0, e.clientY - rect.top - defaultH / 2);

        const pdf = screenToPdf(
          x, y, defaultW, defaultH,
          pageInfo.pageNumber, pageInfo, scale,
        );

        const newField: TextFieldPlacement = {
          id: crypto.randomUUID(),
          pageNumber: pdf.pageNumber,
          x: pdf.x,
          y: pdf.y,
          width: pdf.width,
          height: pdf.height,
          text:
            pendingFieldType === 'date'
              ? new Date().toISOString().split('T')[0]
              : '',
          fontSize: pendingFontSize,
          fieldType: pendingFieldType,
        };

        onTextFieldAdded(newField);
        selectTextField(newField.id);
      }
    },
    [
      signatureBase64,
      scale,
      onPlacementAdded,
      placements.length,
      selectSignature,
      pendingFieldType,
      pendingFontSize,
      onTextFieldAdded,
      selectTextField,
    ],
  );

  // --- Background click to deselect ---
  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) clearSelection();
    },
    [clearSelection],
  );

  // --- Signature Move ---
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

  // --- Signature Resize ---
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
    // e.currentTarget = resize handle, parent = sig block, grandparent = page wrapper
    const wrapper = e.currentTarget.parentElement?.parentElement as HTMLElement;
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

  // --- Text field Move ---
  const handleFieldMoveMove = (
    e: React.PointerEvent,
    fieldId: string,
    field: TextFieldPlacement,
    screen: { x: number; y: number; w: number; h: number },
    pageInfo: PageInfo,
  ) => {
    if (!isDraggingField) return;
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

    const pdf = screenToPdf(
      x, y, screen.w, screen.h,
      pageInfo.pageNumber, pageInfo, scale,
    );
    onTextFieldUpdated(fieldId, { x: pdf.x, y: pdf.y });
  };

  const handleFieldMoveEnd = () => setIsDraggingField(false);

  // --- Delete key handler ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

        if (selectedIndex !== null) {
          onPlacementRemoved(selectedIndex);
          setSelectedIndex(null);
        } else if (selectedFieldId) {
          onTextFieldRemoved(selectedFieldId);
          setSelectedFieldId(null);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    selectedIndex,
    selectedFieldId,
    onPlacementRemoved,
    onTextFieldRemoved,
  ]);

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

            // Signature placements for this page
            const pagePlacements = placements
              .map((p, idx) => ({ p, idx }))
              .filter(({ p }) => p.pageNumber === pageInfo.pageNumber)
              .map(({ p, idx }) => {
                const s = pdfToScreen(p, pageInfo, scale);
                return { idx, x: s.x, y: s.y, w: s.w, h: s.h };
              });

            // Text field placements for this page
            const pageTextFields = textFields.filter(
              (tf) => tf.pageNumber === pageInfo.pageNumber,
            );

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

                {/* Signature placement overlays */}
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
                        key={`sig-${cp.idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectSignature(cp.idx);
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
                        <QrPlaceholder sigHeight={cp.h} scale={scale} borderColor={borderColor} />

                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlacementRemoved(cp.idx);
                              setSelectedIndex(null);
                            }}
                            style={deleteBtnStyle}
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
                            style={resizeHandleStyle}
                          />
                        )}
                      </div>
                    );
                  })}

                {/* Text field overlays */}
                {pageTextFields.map((tf) => {
                  const screen = pdfToScreen(tf, pageInfo, scale);
                  const isSelected = selectedFieldId === tf.id;
                  const isHovered = hoveredFieldId === tf.id;
                  const showControls = isSelected || isHovered;
                  const borderColor = isSelected ? '#2563eb' : '#7c3aed';
                  const borderStyle = isSelected ? 'dashed' : 'solid';
                  const scaledFontSize = tf.fontSize * scale;
                  const gripW = 24;
                  // Measure text to auto-size the field
                  const displayText =
                    tf.text ||
                    (tf.fieldType === 'date' ? 'Date' : 'Type here...');

                  return (
                    <div
                      key={`tf-${tf.id}`}
                      onMouseEnter={() => setHoveredFieldId(tf.id)}
                      onMouseLeave={() => {
                        if (hoveredFieldId === tf.id)
                          setHoveredFieldId(null);
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectTextField(tf.id);
                      }}
                      onPointerMove={
                        isDraggingField
                          ? (e) =>
                              handleFieldMoveMove(
                                e,
                                tf.id,
                                tf,
                                screen,
                                pageInfo,
                              )
                          : undefined
                      }
                      onPointerUp={
                        isDraggingField ? handleFieldMoveEnd : undefined
                      }
                      style={{
                        position: 'absolute',
                        left: screen.x,
                        top: screen.y,
                        display: 'inline-block',
                        minWidth: MIN_FIELD_WIDTH,
                        minHeight: scaledFontSize * 1.8,
                        border: `1px ${borderStyle} ${borderColor}`,
                        borderRadius: 2,
                        background: isSelected
                          ? 'rgba(37,99,235,0.05)'
                          : 'rgba(124,58,237,0.05)',
                        cursor: 'default',
                        userSelect: 'none',
                        touchAction: 'none',
                        padding: '2px 4px',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Grip handle — flush against left edge (child, so
                          mouseleave won't fire when pointer moves to it) */}
                      {showControls && (
                        <div
                          onPointerDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            selectTextField(tf.id);
                            const container = e.currentTarget
                              .parentElement!;
                            const pageWrapper =
                              container.parentElement!;
                            const rect =
                              pageWrapper.getBoundingClientRect();
                            dragOffset.current = {
                              x: e.clientX - rect.left - screen.x,
                              y: e.clientY - rect.top - screen.y,
                            };
                            setIsDraggingField(true);
                            container.setPointerCapture(e.pointerId);
                          }}
                          style={{
                            position: 'absolute',
                            left: -gripW,
                            top: -1,
                            width: gripW,
                            height: 'calc(100% + 2px)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'grab',
                            color: '#6b7280',
                            fontSize: 14,
                            userSelect: 'none',
                            touchAction: 'none',
                            background: '#f9fafb',
                            borderRadius: '3px 0 0 3px',
                            border: `1px solid #d1d5db`,
                            borderRight: 'none',
                          }}
                        >
                          ⠿
                        </div>
                      )}

                      {/* Delete button — top right */}
                      {showControls && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onTextFieldRemoved(tf.id);
                            setSelectedFieldId(null);
                          }}
                          style={deleteBtnStyle}
                        >
                          ×
                        </button>
                      )}

                      {/* Auto-sizing input: hidden span measures text,
                          input stretches to match */}
                      <div style={{ position: 'relative', display: 'inline-block', minWidth: MIN_FIELD_WIDTH - 10 }}>
                        <span
                          style={{
                            visibility: 'hidden',
                            whiteSpace: 'pre',
                            fontSize: scaledFontSize,
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            padding: 0,
                          }}
                        >
                          {displayText}
                        </span>
                        <input
                          value={tf.text}
                          placeholder={
                            tf.fieldType === 'date'
                              ? 'Date'
                              : 'Type here...'
                          }
                          onChange={(e) =>
                            onTextFieldUpdated(tf.id, {
                              text: e.target.value,
                            })
                          }
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontSize: scaledFontSize,
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            padding: 0,
                            margin: 0,
                            color: '#000',
                            cursor: 'text',
                          }}
                        />
                      </div>

                      {/* Bottom toolbar — flush below field */}
                      {showControls && (
                        <div
                          style={{
                            position: 'absolute',
                            left: -1,
                            top: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            background: '#f9fafb',
                            border: '1px solid #d1d5db',
                            borderRadius: '0 0 3px 3px',
                            borderTop: 'none',
                            padding: '2px 6px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <select
                            value={tf.fontSize}
                            onChange={(e) => {
                              e.stopPropagation();
                              onTextFieldUpdated(tf.id, {
                                fontSize: Number(e.target.value),
                              });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            style={fontSizeSelectStyle}
                          >
                            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map(
                              (sz) => (
                                <option key={sz} value={sz}>
                                  {sz}px
                                </option>
                              ),
                            )}
                          </select>
                          <span style={{ fontSize: 10, color: '#888' }}>
                            {tf.fieldType}
                          </span>
                        </div>
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

const deleteBtnStyle: React.CSSProperties = {
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
};

const resizeHandleStyle: React.CSSProperties = {
  position: 'absolute',
  right: -5,
  bottom: -5,
  width: 10,
  height: 10,
  background: '#2563eb',
  borderRadius: 2,
  cursor: 'nwse-resize',
};

const fontSizeSelectStyle: React.CSSProperties = {
  fontSize: 11,
  padding: '0 2px',
  border: '1px solid #d1d5db',
  borderRadius: 3,
  background: '#f9fafb',
  cursor: 'pointer',
  outline: 'none',
  height: 18,
};
