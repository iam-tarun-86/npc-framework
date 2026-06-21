import { useEffect, useState } from 'react';

export default function Hud() {
  const [nearNPC, setNearNPC] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      setNearNPC(e.detail?.nearNPC || null);
    };
    window.addEventListener('game-state', handler);
    return () => window.removeEventListener('game-state', handler);
  }, []);

  if (!nearNPC) return null;

  return (
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
  );
}