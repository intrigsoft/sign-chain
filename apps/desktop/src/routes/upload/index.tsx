import { useNavigate } from 'react-router-dom';
import { openPdfPicker, getPdfPageCount } from '../../lib/tauri';
import { useSigningStore } from '../../store/signing';
import PdfPreview from '../../components/PdfPreview';

export default function UploadPage() {
  const navigate = useNavigate();
  const { filePath, fileName, pageCount, setFile } = useSigningStore();

  const handleBrowse = async () => {
    const path = await openPdfPicker();
    if (!path) return;

    const count = await getPdfPageCount(path);
    const name = path.split(/[\\/]/).pop() ?? 'document.pdf';
    setFile(path, name, count);
  };

  return (
    <div className="flex h-screen">
      {/* Left panel */}
      <div className="w-80 p-6 border-r border-gray-200 flex flex-col">
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-transparent border-none cursor-pointer mb-6 text-left text-brand-700 hover:text-brand-800"
        >
          &larr; Back
        </button>

        <h2 className="text-xl mb-4">Upload PDF</h2>

        <button
          onClick={handleBrowse}
          className="px-6 py-3 text-sm bg-brand-700 hover:bg-brand-800 text-white border-none rounded-lg cursor-pointer mb-4"
        >
          Browse...
        </button>

        {fileName && (
          <div className="mb-4">
            <p className="font-semibold">{fileName}</p>
            <p className="text-gray-500 text-sm">{pageCount} page(s)</p>
          </div>
        )}

        <div className="flex-1" />

        <button
          onClick={() => navigate('/sign')}
          disabled={!filePath}
          className="px-6 py-3 text-sm bg-brand-700 hover:bg-brand-800 text-white border-none rounded-lg cursor-pointer disabled:bg-gray-300 disabled:cursor-default disabled:hover:bg-gray-300"
        >
          Continue &rarr;
        </button>
      </div>

      {/* Right panel — PDF preview */}
      <div className="flex-1 flex items-center justify-center bg-gray-50 overflow-auto">
        {filePath ? (
          <PdfPreview filePath={filePath} />
        ) : (
          <p className="text-gray-400">Select a PDF to preview</p>
        )}
      </div>
    </div>
  );
}
