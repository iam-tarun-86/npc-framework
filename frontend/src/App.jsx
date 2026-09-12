import { useState, useEffect } from 'react';
import GameCanvas from './game/GameCanvas';
import WorldCanvas3D from './game/three/WorldCanvas3D';
import DialogueOverlay from './ui/DialogueOverlay';
import DevPanel from './ui/DevPanel';
import Hud from './ui/Hud';
import NpcNameplate from './ui/NpcNameplate';

export default function App() {
  const [renderMode, setRenderMode] = useState('3d'); // '3d' default, '2d' Phaser fallback
  const [dialogueNPC, setDialogueNPC] = useState(null);
  const [devOpen, setDevOpen] = useState(false);
  const [debugData, setDebugData] = useState(null);

  useEffect(() => {
    const startHandler = (e) => {
      setDialogueNPC(e.detail);
      window.dispatchEvent(new CustomEvent('dialogue-open'));
    };
    const devHandler = () => setDevOpen(prev => !prev);
    const debugHandler = (e) => {
      const data = e.detail?.debug || e.detail;
      if (data) setDebugData(data);
    };

    window.addEventListener('start-dialogue', startHandler);
    window.addEventListener('toggle-dev', devHandler);
    window.addEventListener('debug-update', debugHandler);

    return () => {
      window.removeEventListener('start-dialogue', startHandler);
      window.removeEventListener('toggle-dev', devHandler);
      window.removeEventListener('debug-update', debugHandler);
    };
  }, []);

  function handleCloseDialogue() {
    setDialogueNPC(null);
    window.dispatchEvent(new CustomEvent('dialogue-close'));
  }

  return (
    <div className="fixed inset-0 bg-gray-900 overflow-hidden">
      {renderMode === '3d' ? <WorldCanvas3D /> : <GameCanvas />}
      {renderMode === '3d' && <NpcNameplate dialogueOpen={!!dialogueNPC} />}
      <Hud />

      {dialogueNPC && (
        <DialogueOverlay
          npcData={dialogueNPC}
          onClose={handleCloseDialogue}
        />
      )}

      {/* Engine Switcher for Fallback Verification */}
      <div className="fixed top-2 right-12 z-50 flex items-center bg-gray-900/80 backdrop-blur border border-cyan-500/30 rounded px-2 py-1 gap-1 text-xs">
        <span className="text-gray-400 font-mono text-[10px]">ENGINE:</span>
        <button
          onClick={() => setRenderMode('3d')}
          className={`px-1.5 py-0.5 rounded font-bold transition ${renderMode === '3d' ? 'bg-cyan-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
        >
          3D
        </button>
        <button
          onClick={() => setRenderMode('2d')}
          className={`px-1.5 py-0.5 rounded font-bold transition ${renderMode === '2d' ? 'bg-amber-500 text-black shadow-sm' : 'text-gray-400 hover:text-white'}`}
        >
          2D (Phaser)
        </button>
      </div>

      <button
        onClick={() => setDevOpen(!devOpen)}
        className="fixed top-2 right-2 z-50 w-8 h-8 bg-gray-700/80 hover:bg-gray-600 text-gray-400 hover:text-white rounded text-xs flex items-center justify-center transition"
        title="Dev View (Tab)"
      >
        🔧
      </button>

      {devOpen && <DevPanel debugData={debugData} onClose={() => setDevOpen(false)} />}
    </div>
  );
}
