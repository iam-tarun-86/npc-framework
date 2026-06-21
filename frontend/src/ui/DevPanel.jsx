import { useState, useEffect } from 'react';
import { getAllMemories, clearMemory, clearAllMemories } from '../api';

const NPC_ICONS = {
  alaric: '🧙‍♂️',
  borin: '⚔️',
  vexis: '🗡️',
  mira: '👵'
};

const MOOD_COLORS = {
  high: 'bg-green-500',
  mid: 'bg-yellow-500',
  low: 'bg-red-500'
};

function MoodBar({ mood }) {
  const color = mood > 0.6 ? MOOD_COLORS.high : mood > 0.3 ? MOOD_COLORS.mid : MOOD_COLORS.low;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${mood * 100}%` }}
        />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{mood.toFixed(2)}</span>
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-3">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-amber-400 transition-colors mb-1"
      >
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        {title}
      </button>
      {open && <div className="animate-fade-in">{children}</div>}
    </div>
  );
}

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

    if (!confirm("Are you ABSOLUTELY sure?")) return;

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
    <div className="fixed top-12 right-2 w-[520px] bg-slate-900/95 rounded-xl z-50 border border-amber-500/20 shadow-2xl shadow-black/50 max-h-[85vh] overflow-hidden flex flex-col backdrop-blur-sm">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">🔧</span>
          <h3 className="text-amber-400 font-bold text-lg">Dev Panel</h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleMasterClear}
            disabled={masterClearing}
            className="bg-red-900/80 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors border border-red-700/50"
            title="Wipe ALL NPC memories"
          >
            {masterClearing ? '...' : '💥 MASTER CLEAR'}
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - NPC List */}
        <div className="w-44 border-r border-slate-700/50 overflow-y-auto custom-scroll bg-slate-800/30">
          <div className="p-3 text-xs text-slate-500 font-bold uppercase tracking-wider">NPCs</div>
          {loading ? (
            <div className="p-3 text-slate-400 text-xs">Loading...</div>
          ) : (
            Object.entries(allData).map(([npcId, data]) => (
              <button
                key={npcId}
                onClick={() => setSelectedNPC(npcId)}
                className={`w-full text-left p-3 hover:bg-slate-700/50 transition-all ${selectedNPC === npcId ? 'bg-slate-700/50 border-l-2 border-amber-400' : 'border-l-2 border-transparent'
                  }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{NPC_ICONS[npcId] || '👤'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-sm font-bold truncate">{data.name}</div>
                    <div className="text-slate-500 text-xs truncate">{data.role}</div>
                  </div>
                </div>
                <MoodBar mood={data.mood} />
                <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                  {data.interaction_count} chats
                </div>
              </button>
            ))
          )}
        </div>

        {/* Main - Details */}
        <div className="flex-1 overflow-y-auto custom-scroll p-4">
          {!selectedNPC ? (
            <div className="text-slate-500 text-sm text-center mt-20">
              <div className="text-3xl mb-2">👈</div>
              Select an NPC to view details
            </div>
          ) : !selectedData ? (
            <div className="text-slate-500 text-sm">Loading...</div>
          ) : (
            <div>
              {/* NPC Header */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-xl border border-amber-500/20">
                    {NPC_ICONS[selectedNPC] || '👤'}
                  </div>
                  <div>
                    <h4 className="text-slate-200 font-bold">{selectedData.name}</h4>
                    <p className="text-slate-500 text-xs">{selectedData.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleClearMemory(selectedNPC)}
                  disabled={clearing}
                  className="bg-red-900/60 hover:bg-red-800 text-red-200 px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50 transition-colors border border-red-700/30"
                >
                  {clearing ? '...' : '🗑️ Clear'}
                </button>
              </div>

              {/* Stats */}
              <CollapsibleSection title="Stats">
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <span className="text-red-400 text-xs font-medium">Mood</span>
                    <div className="text-slate-200 font-bold text-lg">{selectedData.mood.toFixed(2)}</div>
                    <MoodBar mood={selectedData.mood} />
                  </div>
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <span className="text-purple-400 text-xs font-medium">Interactions</span>
                    <div className="text-slate-200 font-bold text-lg">{selectedData.interaction_count}</div>
                    <div className="text-slate-500 text-xs mt-1">total chats</div>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Facts - Always show, even when empty */}
              <CollapsibleSection title="Facts">
                {Object.keys(selectedData.facts).length > 0 ? (
                  <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
                    <pre className="text-slate-300 text-xs overflow-x-auto custom-scroll">
                      {JSON.stringify(selectedData.facts, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/20">
                    <p className="text-slate-500 text-xs italic">No facts learned yet</p>
                    <p className="text-slate-600 text-[10px] mt-1">
                      Try telling them your name, trading, or being memorable...
                    </p>
                  </div>
                )}
              </CollapsibleSection>

              {/* Chat History */}
              <CollapsibleSection title="Chat History">
                {selectedData.memories.length === 0 ? (
                  <p className="text-slate-500 text-xs italic">No conversations yet</p>
                ) : (
                  <div className="space-y-2">
                    {selectedData.memories.map((mem, i) => (
                      <div key={i} className={`text-xs p-2.5 rounded-lg ${mem.text.startsWith('Player:')
                          ? 'bg-blue-900/30 text-blue-200 border border-blue-500/20'
                          : 'bg-slate-700/30 text-slate-200 border border-slate-600/20'
                        }`}>
                        {mem.text}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}