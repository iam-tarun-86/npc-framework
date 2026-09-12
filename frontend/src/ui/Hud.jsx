import { useEffect, useState } from 'react';
import { Coins, Shield } from 'lucide-react';

export default function Hud() {
  const [nearNPC, setNearNPC] = useState(null);
  const [playerData, setPlayerData] = useState({ coins: 10, items: [] });

  useEffect(() => {
    const fetchPlayer = async () => {
      try {
        const res = await fetch('http://localhost:5000/player');
        const data = await res.json();
        setPlayerData(data);
      } catch (e) {
        console.error("Fetch failed:", e);
      }
    };

    fetchPlayer();
    const interval = setInterval(fetchPlayer, 2000);

    const handler = (e) => {
      const incoming = e.detail?.nearNPC || null;
      // The game-state event fires every frame (~60/s). Only update React state
      // when the nearby NPC identity actually changes, to avoid constant re-renders.
      setNearNPC((prev) => {
        const prevId = prev?.npcData?.npcId || null;
        const nextId = incoming?.npcData?.npcId || null;
        return prevId === nextId ? prev : incoming;
      });
    };

    window.addEventListener('game-state', handler);

    return () => {
      clearInterval(interval);
      window.removeEventListener('game-state', handler);
    };
  }, []);

  return (
    <>
      {/* Player Inventory & Stats Dock - Top Left */}
      <div className="fixed top-3 left-3 z-30 flex items-center gap-2 select-none">
        {/* Currency Card */}
        <div className="flex items-center gap-2.5 bg-slate-900/85 backdrop-blur-md border border-amber-500/30 rounded-xl px-3.5 py-2 shadow-xl shadow-black/40">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <Coins className="w-4 h-4 text-amber-400 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 leading-none">Silver Coins</span>
            <span className="text-amber-300 font-bold text-base leading-tight font-mono">{playerData.coins ?? 0}</span>
          </div>
        </div>

        {/* Inventory Bag */}
        {playerData.items && playerData.items.length > 0 && (
          <div className="flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-cyan-500/30 rounded-xl px-3 py-2 shadow-xl shadow-black/40 max-w-[340px]">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 flex-shrink-0">
              <Shield className="w-4 h-4 text-cyan-300" />
            </div>
            <div className="flex flex-wrap gap-1 items-center max-h-12 overflow-y-auto custom-scroll">
              {playerData.items.map((item, idx) => (
                <span key={idx} className="bg-cyan-950/60 border border-cyan-500/30 text-cyan-200 text-xs px-2 py-0.5 rounded-md font-medium tracking-wide">
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* World Controls Pill - Bottom Left */}
      <div className="fixed bottom-3 left-3 z-30 hidden sm:flex items-center gap-2 bg-slate-900/75 backdrop-blur-md border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-[11px] font-mono text-slate-400 select-none shadow-md">
        <span className="flex items-center gap-1 text-slate-300"><kbd className="bg-slate-800 border border-slate-600 px-1 rounded text-cyan-300">WASD</kbd> Move</span>
        <span className="text-slate-600">|</span>
        <span className="flex items-center gap-1 text-slate-300"><kbd className="bg-slate-800 border border-slate-600 px-1 rounded text-amber-300">E</kbd> Interact</span>
        <span className="text-slate-600">|</span>
        <span className="flex items-center gap-1 text-slate-300"><kbd className="bg-slate-800 border border-slate-600 px-1 rounded text-purple-300">T</kbd> AI Dev</span>
      </div>

      {/* Spatial Proximity Prompt - Bottom Center */}
      {nearNPC && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 animate-bounce">
          <div className="flex items-center gap-2.5 bg-slate-900/90 backdrop-blur-xl border border-amber-400/40 rounded-full px-5 py-2.5 shadow-2xl shadow-amber-500/20">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <kbd className="bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-md text-xs shadow-sm">
              E
            </kbd>
            <span className="text-slate-200 text-sm font-medium">Talk to</span>
            <span className="text-amber-300 font-bold text-sm tracking-wide">{nearNPC.npcData?.npcName}</span>
            <span className="text-slate-400 text-xs font-mono">({nearNPC.npcData?.role})</span>
          </div>
        </div>
      )}
    </>
  );
}
