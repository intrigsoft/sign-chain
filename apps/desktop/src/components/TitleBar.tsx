import { getCurrentWindow } from '@tauri-apps/api/window';

const appWindow = getCurrentWindow();

export default function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      style={{
        height: 36,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#1e293b',
        color: '#fff',
        userSelect: 'none',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
      }}
    >
      <span
        data-tauri-drag-region
        style={{ fontSize: 13, fontWeight: 600, paddingLeft: 14 }}
      >
        Sign Chain
      </span>

      <div style={{ display: 'flex', height: '100%' }}>
        <button
          onClick={() => appWindow.minimize()}
          style={btnStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          &#x2015;
        </button>
        <button
          onClick={() => appWindow.toggleMaximize()}
          style={btnStyle}
          onMouseEnter={hoverIn}
          onMouseLeave={hoverOut}
        >
          &#x25A1;
        </button>
        <button
          onClick={() => appWindow.close()}
          style={{ ...btnStyle, ...closeBtnStyle }}
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

const btnStyle: React.CSSProperties = {
  width: 46,
  height: '100%',
  border: 'none',
  background: 'transparent',
  color: '#fff',
  fontSize: 14,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const closeBtnStyle: React.CSSProperties = {};

function hoverIn(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
}

function hoverOut(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = 'transparent';
}
