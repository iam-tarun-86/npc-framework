import { useState, useEffect } from 'react';
import { getAllMemories, clearMemory, clearAllMemories } from '../api';

const NPC_ICONS = {
  alaric: '🧙‍♂️',
  borin: '⚔️',
  vexis: '🗡️',
  mira: '👵'
};

export default function DevPanel({ debugData, onClose }) {
  const [allData, setAllData] = useState({});
  const [selectedNPC, setSelectedNPC] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [masterClearing, setMasterClearing] = useState(false);

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (debugData?.npc_id) {
      loadAllData();
      setSelectedNPC(debugData.npc_id);
    }
  }, [debugData]);

  async function loadAllData() {
    setLoading(true);
    try {
      const data = await getAllMemories();
      setAllData(data);
    } catch (e) {
      console.error("Failed to load all memories:", e);
    }
    setLoading(false);
  }

  async function handleClearMemory(npcId) {
    if (!confirm(`Clear ALL memory for ${npcId}?`)) return;
    
    setClearing(true);
    try {
      await clearMemory(npcId);
      await loadAllData();
      alert(`Memory cleared for ${npcId}!`);
    } catch (e) {
      alert("Failed to clear: " + e.message);
    }
    setClearing(false);
  }

  async function handleMasterClear() {
    if (!confirm("⚠️ WIPE ALL MEMORIES?\n\nThis will delete EVERYTHING:\n- All chat histories\n- All facts\n- All mood scores\n- All behavior rules\n\nFor ALL 4 NPCs.\n\nThis cannot be undone.")) return;
    
    if (!confirm("Are you ABSOLUTELY sure? Type 'yes' to confirm.")) return;
    
    setMasterClearing(true);
    try {
      const result = await clearAllMemories();
      await loadAllData();
      setSelectedNPC(null);
      alert(`✅ Wiped ${result.total} NPCs: ${result.cleared_npcs.join(', ')}`);
    } catch (e) {
      alert("Failed to wipe: " + e.message);
    }
    setMasterClearing(false);
  }

  useEffect(() => {
    const handler = (e) => {
      const data = e.detail?.debug || e.detail;
      if (data) {
        loadAllData();
        if (data.npc_id) setSelectedNPC(data.npc_id);
      }
    };
    window.addEventListener('debug-update', handler);
    return () => window.removeEventListener('debug-update', handler);
  }, []);

  const selectedData = selectedNPC ? allData[selectedNPC] : null;

  return (
    <div className="fixed top-12 right-2 w-[500px] bg-gray-800/95 rounded-lg z-50 border border-gray-600 max-h-[85vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-3 border-b border-gray-700">
        <h3 className="text-amber-400 font-bold">🔧 Dev Panel</h3>
        <div className="flex gap-2">
          <button
            onClick={handleMasterClear}
            disabled={masterClearing}
            className="bg-red-800 hover:bg-red-900 text-white px-2 py-1 rounded text-xs font-bold disabled:opacity-50"
            title="Wipe ALL NPC memories"
          >
            {masterClearing ? '...' : '💥 MASTER CLEAR'}
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - NPC List */}
        <div className="w-40 border-r border-gray-700 overflow-y-auto">
          <div className="p-2 text-xs text-gray-500 font-bold uppercase">NPCs</div>
          {loading ? (
            <div className="p-2 text-gray-400 text-xs">Loading...</div>
          ) : (
            Object.entries(allData).map(([npcId, data]) => (
              <button
                key={npcId}
                onClick={() => setSelectedNPC(npcId)}
                className={`w-full text-left p-2 hover:bg-gray-700 transition ${
                  selectedNPC === npcId ? 'bg-gray-700 border-l-2 border-amber-400' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{NPC_ICONS[npcId] || '👤'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-bold truncate">{data.name}</div>
                    <div className="text-gray-400 text-xs truncate">{data.role}</div>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <div className="w-16 bg-gray-600 rounded-full h-1">
                    <div 
                      className={`h-1 rounded-full ${
                        data.mood > 0.6 ? 'bg-green-500' : data.mood > 0.3 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${data.mood * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400">{data.mood}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {data.interaction_count} chats
                </div>
              </button>
            ))
          )}
        </div>

        {/* Main - Chat History */}
        <div className="flex-1 overflow-y-auto p-3">
          {!selectedNPC ? (
            <div className="text-gray-500 text-sm text-center mt-10">
              Select an NPC from the sidebar to view chat history
            </div>
          ) : !selectedData ? (
            <div className="text-gray-500 text-sm">Loading...</div>
          ) : (
            <div>
              {/* NPC Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-700">
                <div>
                  <h4 className="text-white font-bold">{selectedData.name}</h4>
                  <p className="text-gray-400 text-xs">{selectedData.role}</p>
                </div>
                <button
                  onClick={() => handleClearMemory(selectedNPC)}
                  disabled={clearing}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs font-bold disabled:opacity-50"
                >
                  {clearing ? '...' : '🗑️ Clear'}
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="bg-gray-700 rounded p-2">
                  <span className="text-red-400 text-xs">Mood</span>
                  <div className="text-white font-bold">{selectedData.mood}</div>
                </div>
                <div className="bg-gray-700 rounded p-2">
                  <span className="text-purple-400 text-xs">Chats</span>
                  <div className="text-white font-bold">{selectedData.interaction_count}</div>
                </div>
              </div>

              {/* Facts */}
              {Object.keys(selectedData.facts).length > 0 && (
                <div className="bg-gray-700 rounded p-2 mb-3">
                  <span className="text-yellow-400 text-xs font-bold">Facts</span>
                  <pre className="text-gray-300 text-xs mt-1 overflow-x-auto">
                    {JSON.stringify(selectedData.facts, null, 2)}
                  </pre>
                </div>
              )}

              {/* Chat History */}
              <div>
                <span className="text-green-400 text-xs font-bold">Chat History</span>
                {selectedData.memories.length === 0 ? (
                  <p className="text-gray-500 text-xs mt-1">No conversations yet</p>
                ) : (
                  <div className="mt-1 space-y-1">
                    {selectedData.memories.map((mem, i) => (
                      <div key={i} className={`text-xs p-2 rounded ${
                        mem.text.startsWith('Player:') 
                          ? 'bg-blue-900/50 text-blue-200' 
                          : 'bg-gray-600/50 text-gray-200'
                      }`}>
                        {mem.text}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
