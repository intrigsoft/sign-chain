import { usePdfPreview } from '../hooks/usePdfPreview';

interface PdfPreviewProps {
  filePath: string;
  compact?: boolean;
}

export default function PdfPreview({ filePath, compact }: PdfPreviewProps) {
  const { canvasRef, currentPage, pageCount, loading, nextPage, prevPage } =
    usePdfPreview(filePath);

  if (loading) {
    return <p className="p-4 text-gray-500">Loading PDF...</p>;
  }

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        className="max-w-full object-contain"
        style={compact ? { maxHeight: 250 } : undefined}
      />
      {pageCount > 1 && (
        <div className="flex items-center gap-3 mt-2 text-sm">
          <button
            onClick={prevPage}
            disabled={currentPage <= 1}
            className={`py-1 px-3 border border-gray-300 rounded ${
              currentPage <= 1
                ? 'bg-gray-100 cursor-default'
                : 'bg-white cursor-pointer'
            }`}
          >
            Prev
          </button>
          <span>
            {currentPage} / {pageCount}
          </span>
          <button
            onClick={nextPage}
            disabled={currentPage >= pageCount}
            className={`py-1 px-3 border border-gray-300 rounded ${
              currentPage >= pageCount
                ? 'bg-gray-100 cursor-default'
                : 'bg-white cursor-pointer'
            }`}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
