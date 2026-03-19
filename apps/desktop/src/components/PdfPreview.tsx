import { usePdfPreview } from '../hooks/usePdfPreview';

interface PdfPreviewProps {
  filePath: string;
  compact?: boolean;
}

export default function PdfPreview({ filePath, compact }: PdfPreviewProps) {
  const { canvasRef, currentPage, pageCount, loading, nextPage, prevPage } =
    usePdfPreview(filePath);

  if (loading) {
    return <p style={{ padding: 16, color: '#666' }}>Loading PDF...</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: '100%',
          maxHeight: compact ? 250 : undefined,
          objectFit: 'contain',
        }}
      />
      {pageCount > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
            fontSize: 14,
          }}
        >
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            style={{
              padding: '4px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              background: currentPage <= 1 ? '#f3f4f6' : '#fff',
              cursor: currentPage <= 1 ? 'default' : 'pointer',
            }}
          >
            Prev
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= pageCount}
            style={{
              padding: '4px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              background: currentPage >= pageCount ? '#f3f4f6' : '#fff',
              cursor: currentPage >= pageCount ? 'default' : 'pointer',
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
