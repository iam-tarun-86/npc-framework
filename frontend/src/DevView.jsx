import { useState } from "react";
import { sendMessage } from "./api";

const API_URL = "http://localhost:5000";

export default function DevView({ npcId = "merchant_01" }) {
    const [input, setInput] = useState("");
    const [debug, setDebug] = useState(null);
    const [reply, setReply] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSend() {
        if (!input.trim()) return;
        setLoading(true);
        const data = await sendMessage(npcId, input);
        setReply(data.reply || data.error || "No response");
        setDebug(data.debug || null);
        setInput("");
        setLoading(false);
    }

    async function clearMemory() {
        if (!confirm("Clear all memory for this NPC?")) return;
        try {
            const res = await fetch(`${API_URL}/clear-memory`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ npc_id: npcId }),
            });
            const data = await res.json();
            alert(data.message || "Memory cleared");
            setDebug(null);
            setReply("");
        } catch (e) {
            alert("Failed to clear memory: " + e.message);
        }
    }

    return (
        <div className="min-h-screen bg-gray-900 p-4">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold text-amber-400">🔧 Dev View — NPC Internals</h1>
                    <button
                        onClick={clearMemory}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-bold text-sm"
                    >
                        🗑️ Clear Memory
                    </button>
                </div>

                {/* Input Section */}
                <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === "Enter" && handleSend()}
                            placeholder="Type a message to test..."
                            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading}
                            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50"
                        >
                            {loading ? "Testing..." : "Test"}
                        </button>
                    </div>
                </div>

                {debug && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* NPC Reply - Full Width */}
                        <div className="lg:col-span-2 bg-gray-800 rounded-lg p-4 border-l-4 border-green-500">
                            <h3 className="text-green-400 font-bold mb-2 text-sm uppercase tracking-wide">🎭 NPC Reply</h3>
                            <p className="text-white text-lg">{reply}</p>
                        </div>

                        {/* Intent */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="text-purple-400 font-bold mb-3 text-sm uppercase tracking-wide">🎯 Intent Detected</h3>
                            <span className="bg-purple-900 text-purple-200 px-4 py-2 rounded-full text-sm font-mono">
                                {debug.intent_detected}
                            </span>
                        </div>

                        {/* Mood */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="text-red-400 font-bold mb-3 text-sm uppercase tracking-wide">😤 Mood Score</h3>
                            <div className="flex items-center gap-3">
                                <div className="flex-1 bg-gray-700 rounded-full h-3">
                                    <div
                                        className={`h-3 rounded-full transition-all ${debug.mood_score > 0.7 ? "bg-green-500" :
                                                debug.mood_score > 0.4 ? "bg-yellow-500" : "bg-red-500"
                                            }`}
                                        style={{ width: `${debug.mood_score * 100}%` }}
                                    />
                                </div>
                                <span className="text-white font-mono text-sm">{debug.mood_score?.toFixed(2)}</span>
                            </div>
                            <p className="text-gray-400 text-xs mt-2">
                                {debug.mood_score > 0.7 ? "Friendly" :
                                    debug.mood_score > 0.4 ? "Neutral" : "Hostile"}
                            </p>
                        </div>

                        {/* Situation */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="text-blue-400 font-bold mb-3 text-sm uppercase tracking-wide">📍 Current Situation</h3>
                            <ul className="space-y-2">
                                {debug.situation?.map((s, i) => (
                                    <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                                        <span className="text-blue-500 mt-1">•</span>
                                        {s}
                                    </li>
                                )) || <li className="text-gray-500 text-sm">No situation data</li>}
                            </ul>
                        </div>

                        {/* Facts */}
                        <div className="bg-gray-800 rounded-lg p-4">
                            <h3 className="text-yellow-400 font-bold mb-3 text-sm uppercase tracking-wide">🧠 Semantic Facts</h3>
                            {Object.keys(debug.facts || {}).length > 0 ? (
                                <div className="space-y-2">
                                    {Object.entries(debug.facts).map(([key, values]) => (
                                        <div key={key} className="bg-gray-700 rounded p-2">
                                            <span className="text-yellow-500 font-bold text-sm">{key}:</span>
                                            <div className="text-gray-300 text-sm mt-1">
                                                {Array.isArray(values) ? values.join(", ") : String(values)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm italic">No facts stored yet</p>
                            )}
                        </div>

                        {/* Behavior Rules */}
                        <div className="bg-gray-800 rounded-lg p-4 lg:col-span-2">
                            <h3 className="text-orange-400 font-bold mb-3 text-sm uppercase tracking-wide">⚙️ Behavior Rules</h3>
                            {Object.keys(debug.behavior_rules || {}).length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(debug.behavior_rules).map(([key, value]) => (
                                        <div key={key} className="bg-gray-700 rounded p-2 flex justify-between">
                                            <span className="text-orange-300 text-sm">{key}</span>
                                            <span className="text-gray-300 text-sm">{value}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-500 text-sm italic">No behavior rules learned yet</p>
                            )}
                        </div>
                    </div>
                )}

                {!debug && !loading && (
                    <div className="text-center text-gray-500 mt-12">
                        <p className="text-lg">Send a message to see NPC internals</p>
                        <p className="text-sm mt-2">Intent, mood, facts, and behavior rules will appear here</p>
                    </div>
                )}
            </div>
        </div>
    );
}