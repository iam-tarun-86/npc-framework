import { useEffect, useState } from 'react';

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
      setNearNPC(e.detail?.nearNPC || null);
    };

    window.addEventListener('game-state', handler);

    return () => {
      clearInterval(interval);
      window.removeEventListener('game-state', handler);
    };
  }, []);

  return (
    <>
      {/* Player Stats - Top Left */}
      <div className="fixed top-4 left-4 z-30">
        <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-sm border border-amber-500/20 rounded-lg px-3 py-2 shadow-lg">
          <span className="text-amber-400 font-bold text-lg">🪙 {playerData.coins || 0}</span>
          {playerData.items && playerData.items.length > 0 && (
            <span className="text-slate-300 text-sm truncate max-w-[200px]">
              ⚔️ {playerData.items.join(", ")}
            </span>
          )}
        </div>
      </div>

      {/* NPC Prompt - Bottom Center */}
      {nearNPC && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 animate-fade-in">
          <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-sm border border-amber-500/20 rounded-full px-4 py-2 shadow-lg">
            <span className="text-slate-300 text-sm">Press</span>
            <kbd className="bg-slate-700 border border-slate-500 rounded px-2 py-0.5 text-amber-400 font-bold text-sm shadow-sm min-w-[24px] text-center">
              E
            </kbd>
            <span className="text-slate-300 text-sm">to talk to</span>
            <span className="text-amber-400 font-bold text-sm">{nearNPC.npcData?.npcName}</span>
          </div>
        </div>
      )}
    </>
  );
}