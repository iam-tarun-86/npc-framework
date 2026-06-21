import { useState, useEffect } from 'react';
import GameCanvas from './game/GameCanvas';
import DialogueOverlay from './ui/DialogueOverlay';
import DevPanel from './ui/DevPanel';
import Hud from './ui/Hud';

export default function App() {
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
      <GameCanvas />
      <Hud />
      
      {dialogueNPC && (
        <DialogueOverlay 
          npcData={dialogueNPC} 
          onClose={handleCloseDialogue}
        />
      )}
      
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
