import { useState } from "react";
import { sendMessage } from "./api";

export default function PlayerView({ npcId = "merchant_01" }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!input.trim()) return;
    setLoading(true);
    
    const userMsg = { role: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    
    const data = await sendMessage(npcId, input);
    
    const npcMsg = { role: "npc", text: data.reply };
    setMessages((prev) => [...prev, npcMsg]);
    setInput("");
    setLoading(false);
  }

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto p-4">
      {/* NPC Portrait Area */}
      <div className="bg-gray-800 rounded-lg p-6 mb-4 text-center">
        <div className="w-24 h-24 bg-gray-600 rounded-full mx-auto mb-2 flex items-center justify-center text-3xl">
          🧙‍♂️
        </div>
        <h2 className="text-xl font-bold text-amber-400">Alaric the Merchant</h2>
        <p className="text-sm text-gray-400">Gruff, greedy, secretly helpful</p>
      </div>

      {/* Chat Area */}
      <div className="flex-1 bg-gray-900 rounded-lg p-4 overflow-y-auto mb-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-[80%] ${
              msg.role === "user"
                ? "bg-blue-900 ml-auto text-right"
                : "bg-gray-700 mr-auto"
            }`}
          >
            {msg.text}
          </div>
        ))}
        {loading && (
          <div className="bg-gray-700 p-3 rounded-lg max-w-[80%] animate-pulse">
            Alaric is thinking...
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Speak to Alaric..."
          className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
        />
        <button
          onClick={handleSend}
          disabled={loading}
          className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}