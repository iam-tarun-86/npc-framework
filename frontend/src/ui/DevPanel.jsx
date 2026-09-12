import { useState, useEffect } from 'react';
import { getAllMemories, clearMemory, clearAllMemories } from '../api';
import AINeuralCore3D from './AINeuralCore3D';
import { Activity, Brain, Trash2, Zap, Database, MessageSquare, X, WifiOff } from 'lucide-react';

const NPC_ICONS = {
  alaric: '🧙‍♂️',
  borin: '⚔️',
  vexis: '🗡️',
  mira: '👵'
};

function MoodBar({ mood }) {
  const m = typeof mood === 'number' ? mood : 0.5;
  const color = m > 0.6 ? 'bg-emerald-500' : m > 0.35 ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-slate-800 rounded-full h-1.5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, m * 100))}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-slate-400 w-7 text-right">{m.toFixed(2)}</span>
    </div>
  );
}

export default function DevPanel({ debugData, onClose }) {
  const [allData, setAllData] = useState({});
  const [selectedNPC, setSelectedNPC] = useState(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [masterClearing, setMasterClearing] = useState(false);
  const [latestDebug, setLatestDebug] = useState(null);
  const [error, setError] = useState(null);

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
      if (data && data.error) throw new Error(data.error);
      setAllData(data || {});
      setError(null);
      setSelectedNPC(prev => prev || (debugData?.npc_id || Object.keys(data || {})[0] || 'alaric'));
      window.dispatchEvent(new CustomEvent('npc-state-update', { detail: data }));
    } catch (e) {
      console.error('Failed to load all memories:', e);
      setError('Backend unreachable — telemetry unavailable (is the Flask server on :5000 running?).');
    }
    setLoading(false);
  }

  async function handleClearMemory(npcId) {
    if (!confirm(`Clear episodic vector memories for ${npcId}?`)) return;

    setClearing(true);
    try {
      await clearMemory(npcId);
      await loadAllData();
    } catch (e) {
      alert("Failed to clear: " + e.message);
    }
    setClearing(false);
  }

  async function handleMasterClear() {
    if (!confirm("⚠️ Master Clear: Wipe vector memory and database facts for all NPCs?")) return;

    setMasterClearing(true);
    try {
      await clearAllMemories();
      await loadAllData();
      setSelectedNPC(null);
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
        setLatestDebug(data);
        if (data.npc_id) setSelectedNPC(data.npc_id);
      }
    };
    window.addEventListener('debug-update', handler);
    return () => window.removeEventListener('debug-update', handler);
  }, []);

  const selectedData = selectedNPC ? allData[selectedNPC] : null;

  return (
    <div className="fixed top-12 right-3 w-[560px] bg-slate-900/95 backdrop-blur-2xl rounded-2xl z-50 border border-slate-700/80 shadow-2xl shadow-black/80 max-h-[88vh] overflow-hidden flex flex-col animate-fade-in">
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-700/60 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-slate-100 font-extrabold text-sm tracking-wide flex items-center gap-2">
              AI Observability Console
              <span className="text-[10px] bg-indigo-500/20 text-indigo-300 font-mono px-2 py-0.5 rounded-full border border-indigo-500/30">
                PyTorch + ChromaDB
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleMasterClear}
            disabled={masterClearing}
            className="bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/40 px-3 py-1 rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
            title="Wipe ALL NPC memories"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Wipe All</span>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - NPC List */}
        <div className="w-48 border-r border-slate-700/60 overflow-y-auto custom-scroll bg-slate-950/40 p-2 space-y-1.5">
          <div className="px-2 py-1 text-[10px] text-slate-500 font-mono font-bold uppercase tracking-wider">Agents</div>
          {error ? (
            <div className="m-1 p-2.5 rounded-lg bg-rose-950/40 border border-rose-600/40 text-rose-300 text-[11px] font-mono flex items-start gap-1.5">
              <WifiOff className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          ) : loading ? (
            <div className="p-3 text-slate-400 text-xs font-mono">Loading telemetry...</div>
          ) : (
            Object.entries(allData).map(([npcId, data]) => (
              <button
                key={npcId}
                onClick={() => setSelectedNPC(npcId)}
                className={`w-full text-left p-2.5 rounded-xl transition-all border ${
                  selectedNPC === npcId
                    ? 'bg-indigo-600/20 border-indigo-500/60 text-white shadow-lg shadow-indigo-950/30'
                    : 'bg-slate-900/60 border-slate-800/80 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{NPC_ICONS[npcId] || '👤'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-200 text-xs font-bold truncate">{data.name}</div>
                    <div className="text-slate-500 text-[10px] font-mono truncate">{data.role}</div>
                  </div>
                </div>
                <MoodBar mood={data.mood} />
                <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center justify-between">
                  <span>chats: {data.interaction_count}</span>
                  <span>mem: {data.memories?.length ?? 0}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Main Details Panel */}
        <div className="flex-1 overflow-y-auto custom-scroll p-4 space-y-4">
          {!selectedNPC ? (
            <div className="flex flex-col items-center justify-center h-64 text-center text-slate-500 text-xs">
              <Brain className="w-10 h-10 text-slate-600 mb-2 opacity-50" />
              <span>Select an NPC to inspect real cognitive state and 3D Neural Core.</span>
            </div>
          ) : !selectedData ? (
            <div className="text-slate-500 text-xs font-mono">Loading data...</div>
          ) : (
            <div>
              {/* NPC Top Header & Prune */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-700/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-2xl border border-slate-600/50">
                    {NPC_ICONS[selectedNPC] || '👤'}
                  </div>
                  <div>
                    <h4 className="text-slate-100 font-bold text-sm leading-tight">{selectedData.name}</h4>
                    <p className="text-slate-400 text-xs font-mono">{selectedData.role}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleClearMemory(selectedNPC)}
                  disabled={clearing}
                  className="bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 px-2.5 py-1 rounded-lg text-xs font-mono transition flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Prune</span>
                </button>
              </div>

              {/* 3D Neural Core & Live Telemetry Metrics */}
              <div className="mt-3.5 grid grid-cols-3 gap-2.5">
                {/* 3D Particle Sphere */}
                <div className="col-span-1">
                  <AINeuralCore3D
                    surpriseScore={latestDebug?.npc_id === selectedNPC ? latestDebug.surprise_score : 0.0012}
                    surpriseTriggered={latestDebug?.npc_id === selectedNPC ? latestDebug.surprise_triggered : false}
                    moodScore={selectedData.mood}
                    memoryCount={selectedData.memories?.length ?? 4}
                  />
                </div>

                {/* Live Metrics Cards */}
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                      <Activity className="w-3 h-3 text-rose-400" /> Mood Score
                    </span>
                    <div className="text-slate-100 font-mono font-bold text-base mt-0.5">{(selectedData.mood ?? 0.5).toFixed(2)}</div>
                    <MoodBar mood={selectedData.mood} />
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-[10px] font-mono uppercase text-slate-400 flex items-center gap-1">
                      <Database className="w-3 h-3 text-cyan-400" /> ChromaDB Vectors
                    </span>
                    <div className="text-slate-100 font-mono font-bold text-base mt-0.5">{selectedData.memories?.length ?? 0}</div>
                    <span className="text-[10px] text-slate-500 font-mono">consolidated turns</span>
                  </div>

                  {/* Autoencoder Surprise Card */}
                  <div className="col-span-2 p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-amber-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" /> Autoencoder Loss (CO4/CO5)
                      </span>
                      <div className="text-slate-200 font-mono text-xs mt-0.5">
                        {latestDebug && latestDebug.npc_id === selectedNPC && latestDebug.surprise_score !== undefined
                          ? `Loss: ${latestDebug.surprise_score.toFixed(6)}`
                          : 'Baseline: 0.001420 threshold'}
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold font-mono ${
                      latestDebug?.npc_id === selectedNPC && latestDebug.surprise_triggered
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40 animate-pulse'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {latestDebug?.npc_id === selectedNPC && latestDebug.surprise_triggered ? 'SURPRISED' : 'CALM'}
                    </span>
                  </div>
                </div>
              </div>

              {/* SQLite Facts Matrix */}
              <div className="mt-4">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-indigo-400" /> Persistent Facts (SQLite)
                </div>
                {Object.keys(selectedData.facts || {}).length > 0 ? (
                  <div className="bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                    <pre className="text-slate-300 text-xs font-mono overflow-x-auto custom-scroll max-h-32">
                      {JSON.stringify(selectedData.facts, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="bg-slate-950/40 rounded-xl p-3 border border-slate-800/60 text-slate-500 text-xs italic">
                    No persistent facts stored yet.
                  </div>
                )}
              </div>

              {/* Episodic Vector Memories */}
              <div className="mt-4">
                <div className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Vector Memory Logs
                </div>
                {(selectedData.memories?.length ?? 0) === 0 ? (
                  <p className="text-slate-500 text-xs italic bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                    No episodic memories in vector store.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scroll pr-1">
                    {(selectedData.memories || []).map((mem, i) => (
                      <div
                        key={i}
                        className={`text-xs p-2.5 rounded-lg font-mono leading-relaxed border ${
                          mem.type === 'surprise'
                            ? 'bg-amber-950/30 text-amber-200 border-amber-800/50'
                            : 'bg-slate-950/50 text-slate-300 border-slate-800'
                        }`}
                      >
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
