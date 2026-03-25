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
import { useLibraryStore } from '../store/library';
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
// QR placeholder — bottom-aligned with vertical branding text
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
  // Match Rust: qr_size = placement.height.max(34.0), placed 4pt right, bottom-aligned
  const qrSize = Math.max(sigHeight, QR_MIN_PT * scale);
  // Match Rust: account for QR quiet zone (4/49 of image size)
  const quietZone = qrSize * (4 / 49);
  const brandFontSize = Math.max(3, (qrSize - 2 * quietZone) / 10);
  return (
    <>
      {/* QR box */}
      <div
        className="absolute bottom-0 flex items-center justify-center rounded pointer-events-none font-semibold opacity-70"
        style={{
          left: '100%',
          width: qrSize,
          height: qrSize,
          marginLeft: 4 * scale,
          border: `2px dashed ${borderColor}`,
          color: borderColor,
          fontSize: 11,
        }}
      >
        QR
      </div>
      {/* Branding text below QR */}
      <div
        className="absolute text-right text-gray-400 pointer-events-none whitespace-nowrap"
        style={{
          left: `calc(100% + ${4 * scale + quietZone}px)`,
          bottom: -(brandFontSize + 4 - quietZone),
          width: qrSize - 2 * quietZone,
          fontSize: brandFontSize,
          fontFamily: 'Helvetica, Arial, sans-serif',
          lineHeight: 1,
        }}
      >
        Signed with SignChain
      </div>
    </>
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
      } else if (dragType.startsWith('textSnippet:')) {
        // Saved text snippet from library
        const snippetId = dragType.slice('textSnippet:'.length);
        const snippet = useLibraryStore.getState().textSnippets.find((s) => s.id === snippetId);
        if (!snippet) return;

        const fontSize = snippet.fontSize || pendingFontSize;
        const defaultW = Math.max(200, snippet.text.length * fontSize * 0.6);
        const defaultH = fontSize * 1.8;
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
          text: snippet.text,
          fontSize,
          fieldType: 'text',
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
      className="flex flex-col h-full w-full"
    >
      {/* Zoom bar */}
      <div className="flex items-center justify-center gap-2 px-3 py-1.5 border-b border-gray-200 bg-white shrink-0 text-[13px]">
        <button onClick={zoomOut} className="px-2.5 py-0.5 text-sm bg-gray-100 border border-gray-300 rounded cursor-pointer leading-[22px]">
          −
        </button>
        <span className="min-w-[48px] text-center">
          {zoomPercent}%
        </span>
        <button onClick={zoomIn} className="px-2.5 py-0.5 text-sm bg-gray-100 border border-gray-300 rounded cursor-pointer leading-[22px]">
          +
        </button>
        <span className="w-px h-4 bg-gray-300" />
        <button onClick={setActualSize} className="px-2.5 py-0.5 text-sm bg-gray-100 border border-gray-300 rounded cursor-pointer leading-[22px]">
          100%
        </button>
        <button onClick={resetZoom} className="px-2.5 py-0.5 text-sm bg-gray-100 border border-gray-300 rounded cursor-pointer leading-[22px]">
          Fit Width
        </button>
        {pageCount > 1 && (
          <span className="ml-3 text-gray-500">
            Page {currentPage}/{pageCount}
          </span>
        )}
      </div>

      {/* Scroll container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={handleBackgroundClick}
        className="flex-1 overflow-y-auto flex flex-col items-center gap-3 py-3 bg-gray-50"
      >
        {loading && (
          <p className="text-gray-400 mt-8">Loading PDF...</p>
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
                className="relative shrink-0 shadow-sm bg-white"
                style={{
                  width: widthPx,
                  height: heightPx,
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
                    const borderColor = isSelected
                      ? 'var(--color-brand-700)'
                      : '#16a34a';
                    const borderStyle = isSelected ? 'dashed' : 'solid';

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
                        className={`absolute rounded select-none touch-none ${
                          isSelected
                            ? 'bg-brand-50/30 cursor-move'
                            : 'bg-green-600/8 cursor-pointer'
                        }`}
                        style={{
                          left: cp.x,
                          top: cp.y,
                          width: cp.w,
                          height: cp.h,
                          border: `2px ${borderStyle} ${borderColor}`,
                        }}
                      >
                        <img
                          src={`data:image/png;base64,${signatureBase64}`}
                          alt="Placed signature"
                          draggable={false}
                          className="w-full h-full object-contain pointer-events-none"
                        />
                        <QrPlaceholder sigHeight={cp.h} scale={scale} borderColor={borderColor} />

                        {isSelected && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlacementRemoved(cp.idx);
                              setSelectedIndex(null);
                            }}
                            className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white border-none cursor-pointer text-xs leading-5 text-center p-0 flex items-center justify-center"
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
                            className="absolute -right-[5px] -bottom-[5px] w-2.5 h-2.5 bg-brand-700 rounded-sm cursor-nwse-resize"
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
                  const borderColor = isSelected
                    ? 'var(--color-brand-700)'
                    : 'var(--color-brand-600)';
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
                      className={`absolute inline-block rounded-sm cursor-default select-none touch-none px-1 py-0.5 box-border ${
                        isSelected
                          ? 'bg-brand-50/30'
                          : 'bg-brand-50/30'
                      }`}
                      style={{
                        left: screen.x,
                        top: screen.y,
                        minWidth: MIN_FIELD_WIDTH,
                        minHeight: scaledFontSize * 1.8,
                        border: `1px ${borderStyle} ${borderColor}`,
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
                          className="absolute flex items-center justify-center cursor-grab text-gray-500 text-sm select-none touch-none bg-gray-50 rounded-l border border-gray-300 border-r-0"
                          style={{
                            left: -gripW,
                            top: -1,
                            width: gripW,
                            height: 'calc(100% + 2px)',
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
                          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white border-none cursor-pointer text-xs leading-5 text-center p-0 flex items-center justify-center"
                        >
                          ×
                        </button>
                      )}

                      {/* Auto-sizing input: hidden span measures text,
                          input stretches to match */}
                      <div className="relative inline-block" style={{ minWidth: MIN_FIELD_WIDTH - 10 }}>
                        <span
                          className="invisible whitespace-pre p-0"
                          style={{
                            fontSize: scaledFontSize,
                            fontFamily: 'Helvetica, Arial, sans-serif',
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
                          className="absolute left-0 top-0 w-full h-full border-none outline-none bg-transparent text-black cursor-text p-0 m-0"
                          style={{
                            fontSize: scaledFontSize,
                            fontFamily: 'Helvetica, Arial, sans-serif',
                          }}
                        />
                      </div>

                      {/* Bottom toolbar — flush below field */}
                      {showControls && (
                        <div
                          className="absolute flex items-center gap-1.5 bg-gray-50 border border-gray-300 rounded-b border-t-0 px-1.5 py-0.5 whitespace-nowrap"
                          style={{
                            left: -1,
                            top: '100%',
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
                            className="text-[11px] px-0.5 py-0 border border-gray-300 rounded-sm bg-gray-50 cursor-pointer outline-none h-[18px]"
                          >
                            {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32].map(
                              (sz) => (
                                <option key={sz} value={sz}>
                                  {sz}px
                                </option>
                              ),
                            )}
                          </select>
                          <span className="text-[10px] text-gray-400">
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
