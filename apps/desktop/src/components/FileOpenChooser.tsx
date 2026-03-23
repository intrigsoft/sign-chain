import { useNavigate } from 'react-router-dom';
import { useSigningStore } from '../store/signing';
import { getPdfPageCount } from '../lib/tauri';

/**
 * Modal shown when a PDF is opened via OS "Open With" / file association.
 * Lets the user choose to sign or verify the document.
 */
export default function FileOpenChooser() {
  const navigate = useNavigate();
  const openedFile = useSigningStore((s) => s.openedFile);
  const setOpenedFile = useSigningStore((s) => s.setOpenedFile);
  const setFile = useSigningStore((s) => s.setFile);
  const reset = useSigningStore((s) => s.reset);

  if (!openedFile) return null;

  const fileName = openedFile.split(/[/\\]/).pop() || openedFile;

  const handleSign = async () => {
    try {
      const count = await getPdfPageCount(openedFile);
      reset();
      setFile(openedFile, fileName, count);
      setOpenedFile(null);
      navigate('/sign');
    } catch (err) {
      console.error('Failed to open file for signing:', err);
      setOpenedFile(null);
    }
  };

  const handleVerify = () => {
    // Store the path for the verify page to pick up
    setOpenedFile(null);
    navigate('/verify', { state: { filePath: openedFile } });
  };

  const handleCancel = () => {
    setOpenedFile(null);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[300]">
      <div className="bg-white rounded-xl p-8 max-w-[420px] w-full shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
        <h3 className="text-lg mb-2">Open PDF</h3>
        <p className="text-gray-500 text-sm mb-6 break-all">
          {fileName}
        </p>
        <p className="text-gray-700 text-sm mb-5">
          What would you like to do with this document?
        </p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={handleSign}
            className="py-3 px-5 text-sm bg-green-600 text-white border-none rounded-lg cursor-pointer font-medium"
          >
            Sign with SignChain
          </button>
          <button
            onClick={handleVerify}
            className="py-3 px-5 text-sm bg-brand-700 text-white border-none rounded-lg cursor-pointer font-medium"
          >
            Verify with SignChain
          </button>
          <button
            onClick={handleCancel}
            className="py-3 px-5 text-sm bg-gray-100 text-gray-700 border border-gray-300 rounded-lg cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
