import { useEffect, useRef, useState, type RefObject } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';

export interface DropZone {
  ref: RefObject<HTMLDivElement | null>;
  onDrop: (paths: string[]) => void;
}

function hitTest(
  position: { x: number; y: number },
  ref: RefObject<HTMLDivElement | null>,
): boolean {
  const el = ref.current;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const logicalX = position.x / dpr;
  const logicalY = position.y / dpr;
  return (
    logicalX >= rect.left &&
    logicalX <= rect.right &&
    logicalY >= rect.top &&
    logicalY <= rect.bottom
  );
}

export function useTauriFileDrop(zones: DropZone[]): {
  activeZoneIndex: number | null;
} {
  const [activeZoneIndex, setActiveZoneIndex] = useState<number | null>(null);
  // Keep zones in a ref so the listener always sees the latest callbacks
  const zonesRef = useRef(zones);
  zonesRef.current = zones;

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        const currentZones = zonesRef.current;

        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          const pos = event.payload.position;
          let matched: number | null = null;
          for (let i = 0; i < currentZones.length; i++) {
            if (hitTest(pos, currentZones[i].ref)) {
              matched = i;
              break;
            }
          }
          setActiveZoneIndex(matched);
        } else if (event.payload.type === 'drop') {
          const pos = event.payload.position;
          const paths: string[] = event.payload.paths;
          for (let i = 0; i < currentZones.length; i++) {
            if (hitTest(pos, currentZones[i].ref)) {
              currentZones[i].onDrop(paths);
              break;
            }
          }
          setActiveZoneIndex(null);
        } else {
          // leave / cancel
          setActiveZoneIndex(null);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      unlisten?.();
    };
  }, []);

  return { activeZoneIndex };
}
