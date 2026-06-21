import { useEffect, useState } from 'react';

export default function Hud() {
  const [nearNPC, setNearNPC] = useState(null);

  useEffect(() => {
    const handler = (e) => setNearNPC(e.detail?.nearNPC || null);
    window.addEventListener('game-state', handler);
    return () => window.removeEventListener('game-state', handler);
  }, []);

  if (!nearNPC) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-black/80 text-white px-4 py-2 rounded-full text-sm animate-pulse">
      Press <span className="font-bold text-yellow-400">E</span> to talk to {nearNPC.npcData?.name}
    </div>
  );
}
