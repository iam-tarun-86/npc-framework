import { useState, useEffect } from 'react';

export default function NpcNameplate({ dialogueOpen }) {
  const [positions, setPositions] = useState({});

  useEffect(() => {
    const handler = (e) => {
      if (e.detail) {
        setPositions(e.detail);
      }
    };
    window.addEventListener('npc-screen-positions', handler);
    return () => window.removeEventListener('npc-screen-positions', handler);
  }, []);

  if (dialogueOpen) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-20 overflow-hidden">
      {Object.entries(positions).map(([key, data]) => {
        if (data.behind) return null;

        const dist = data.distance;
        // Distance-based presentation:
        // - distant (>14m): hidden or minimal dot
        // - medium (8-14m): subtle name only, semi-transparent
        // - nearby (3.5-8m): name + role badge
        // - active proximity (<=3.5m): full presentation with interaction prompt

        if (dist > 18) return null;

        const isDistant = dist > 12;
        const isMedium = dist > 6.5 && dist <= 12;
        const isNearby = dist > 3.5 && dist <= 6.5;
        const isProximity = dist <= 3.5;

        // Color mapping
        const colorHex = '#' + (data.color ? data.color.toString(16).padStart(6, '0') : 'a855f7');

        return (
          <div
            key={key}
            className="absolute -translate-x-1/2 -translate-y-full transition-opacity duration-300"
            style={{
              left: `${data.x}px`,
              top: `${data.y}px`,
              opacity: isDistant ? 0.35 : 1.0,
            }}
          >
            {isDistant && (
              <div
                className="w-2.5 h-2.5 rounded-full border border-white/60 shadow-lg animate-pulse"
                style={{ backgroundColor: colorHex }}
              />
            )}

            {isMedium && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/70 border border-slate-700/50 backdrop-blur-sm shadow-md">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorHex }} />
                <span className="text-[11px] font-medium text-slate-200 tracking-wide font-sans">{data.name}</span>
              </div>
            )}

            {isNearby && (
              <div className="flex flex-col items-center gap-0.5">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900/85 border border-slate-700/80 backdrop-blur-md shadow-lg">
                  <span className="w-2 h-2 rounded-full ring-2 ring-white/20" style={{ backgroundColor: colorHex }} />
                  <span className="text-xs font-bold text-slate-100">{data.name}</span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded-md">
                    {data.role}
                  </span>
                </div>
              </div>
            )}

            {isProximity && (
              <div className="flex flex-col items-center gap-1.5 animate-fade-in scale-105">
                <div
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-950/95 border-2 backdrop-blur-xl shadow-2xl shadow-black/80"
                  style={{ borderColor: colorHex, boxShadow: `0 0 16px ${colorHex}40` }}
                >
                  <span className="w-2.5 h-2.5 rounded-full animate-ping" style={{ backgroundColor: colorHex }} />
                  <span className="text-xs font-black tracking-wide text-white drop-shadow">{data.name}</span>
                  <span
                    className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase tracking-wider"
                    style={{
                      backgroundColor: `${colorHex}25`,
                      color: colorHex,
                      border: `1px solid ${colorHex}60`
                    }}
                  >
                    {data.role}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-[10px] font-black shadow-lg shadow-amber-950/60 border border-amber-300/40">
                  <kbd className="bg-slate-950 text-amber-300 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border border-amber-500/30">E</kbd>
                  <span className="tracking-wide">Talk to {data.name}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
