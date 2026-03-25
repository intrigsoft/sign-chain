import { useEffect, useState } from 'react';
import { useLibraryStore } from '../store/library';
import { useAuthStore } from '../store/auth';

export default function CloudLibraryPrompt() {
  const {
    signatures,
    textSnippets,
    loaded,
    syncEnabled,
    checkCloudLibrary,
    pullFromCloud,
    setSyncEnabled,
  } = useLibraryStore();
  const jwt = useAuthStore((s) => s.jwt);

  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const localEmpty =
    signatures.length === 0 && textSnippets.length === 0;

  useEffect(() => {
    if (!loaded || !jwt || syncEnabled || !localEmpty || checked) return;

    setChecked(true);
    checkCloudLibrary().then((exists) => {
      if (exists) setShow(true);
    });
  }, [loaded, jwt, syncEnabled, localEmpty, checked, checkCloudLibrary]);

  if (!show) return null;

  const handleDownload = async () => {
    setLoading(true);
    try {
      await pullFromCloud();
      await setSyncEnabled(true);
    } finally {
      setLoading(false);
      setShow(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Library Found
        </h2>
        <p className="text-sm text-gray-600 mb-5">
          We found your library on another device. Would you like to download it
          to this machine?
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => setShow(false)}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 border-none rounded-lg cursor-pointer"
          >
            Skip
          </button>
          <button
            onClick={handleDownload}
            disabled={loading}
            className="px-4 py-2 text-sm bg-brand-700 text-white border-none rounded-lg cursor-pointer hover:bg-brand-800"
          >
            {loading ? 'Downloading...' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
