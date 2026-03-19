import { useCallback, useEffect, useRef, useState } from 'react';

interface SignatureCanvasProps {
  onSignature: (base64: string) => void;
  width?: number;
  height?: number;
}

export default function SignatureCanvas({
  onSignature,
  width = 480,
  height = 180,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [width, height]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    exportSignature();
  };

  const exportSignature = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;

    const dataUrl = canvas.toDataURL('image/png');
    // Strip the data:image/png;base64, prefix
    const base64 = dataUrl.split(',')[1];
    onSignature(base64);
  }, [hasDrawn, onSignature]);

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, width, height);
    setHasDrawn(false);
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 8,
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      />
      <div style={{ marginTop: 8 }}>
        <button
          onClick={clear}
          style={{
            padding: '4px 12px',
            fontSize: 13,
            background: '#f3f4f6',
            border: '1px solid #d1d5db',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
}
