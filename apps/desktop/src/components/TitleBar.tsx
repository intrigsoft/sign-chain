import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

export default function TitleBar() {
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

      <div className="flex h-full">
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
