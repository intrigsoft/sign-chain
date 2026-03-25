import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useSigningStore } from '../store/signing';

const appWindow = getCurrentWindow();

export default function TitleBar() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const reset = useSigningStore((s) => s.reset);

  const handleSignOut = async () => {
    await invoke('clear_stored_jwt').catch(() => {});
    clearAuth();
    reset();
  };

  return (
    <div
      data-tauri-drag-region
      className="h-9 flex items-center justify-between bg-brand-900 text-white select-none sticky top-0 z-[1000]"
    >
      <img
        data-tauri-drag-region
        src="/logo.png"
        alt="SignChain"
        className="h-[18px] pl-3.5 brightness-0 invert"
      />

      <div className="flex items-center h-full">
        {user && (
          <>
            <button
              onClick={() => navigate('/library')}
              className="px-3 h-full border-none bg-transparent text-white/70 text-xs cursor-pointer hover:text-white hover:bg-white/10"
            >
              My Library
            </button>
            <span className="text-xs text-white/70 mr-2 truncate max-w-[200px]">
              {user.email}
            </span>
            <button
              onClick={handleSignOut}
              className="px-3 h-full border-none bg-transparent text-white/70 text-xs cursor-pointer hover:text-white hover:bg-white/10"
            >
              Sign out
            </button>
          </>
        )}
        <button
          onClick={() => appWindow.minimize()}
          className="w-[46px] h-full border-none bg-transparent text-white text-sm cursor-pointer flex items-center justify-center"
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          &#x2015;
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          className="w-[46px] h-full border-none bg-transparent text-white text-sm cursor-pointer flex items-center justify-center"
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          &#x25A1;
        </button>
        <button
          onClick={() => appWindow.close()}
          className="w-[46px] h-full border-none bg-transparent text-white text-sm cursor-pointer flex items-center justify-center"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#ef4444';
          }}
          onMouseLeave={hoverOut}
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
}

function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent';
}
