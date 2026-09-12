import { useState, useEffect, useRef } from 'react';
import { sendMessage } from '../api';
import { Send, X, ShoppingBag, Sparkles, MessageSquare } from 'lucide-react';

export default function DialogueOverlay({ npcData, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    inputRef.current?.focus();
  }, [messages]);

  // Esc closes the dialogue (matches the close-button tooltip)
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMessages([]);
        window.dispatchEvent(new CustomEvent('dialogue-close'));
        onClose();
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Dynamic quick-prompt chips according to NPC persona
  const suggestionChips = {
    alaric: ["What wares do you have?", "Buy iron dagger", "Tell me your battle story"],
    borin: ["Patrol status report", "Any sign of bandits?", "Who goes there?"],
    vexis: ["What rumors stir in shadow?", "Heard anything about anomalies?", "Sell information"],
    mira: ["Share the village history", "How are the wards holding?", "Blessings, Elder"]
  }[npcData.npcId] || ["Greetings", "Any news?", "Farewell"];

  async function executeSend(textToSend) {
    if (!textToSend.trim() || loading) return;
    const rawText = textToSend.trim();
    const userText = rawText.toLowerCase();

    // Detect buy intent
    const buyPatterns = [
      /(?:buy|get|take|want|give me)\s+(?:a|an|the)?\s*(.+)/,
      /(?:how much for|price of)\s+(.+)/,
    ];

    const buyMatch = buyPatterns.find(p => p.test(userText));
    let buySucceeded = false;
    let buyAttempted = false;
    let buyErrorMsg = "";

    if (buyMatch && npcData.npcId === 'alaric') {
      const item = userText.match(buyMatch)[1].trim();
      buyAttempted = true;
      setLoading(true);
      setInput('');

      try {
        const res = await fetch('http://localhost:5000/buy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ npc_id: npcData.npcId, item })
        });
        const data = await res.json();

        if (!data.error) {
          buySucceeded = true;
          setMessages(prev => [...prev, {
            role: 'npc',
            text: 'Grrr. ' + data.item + '. ' + data.price + ' coin paid. ' + data.coins_left + ' left. Now out.'
          }]);
        } else {
          buyErrorMsg = data.error;
        }
      } catch (e) {
        console.error("Buy failed:", e);
      }
    }

    if (buySucceeded) {
      setLoading(false);
      return;
    }

    if (buyAttempted && buyErrorMsg && buyErrorMsg !== "Don't sell that.") {
      setMessages(prev => [...prev, { role: 'npc', text: buyErrorMsg }]);
      setLoading(false);
      return;
    }

    // Normal chat flow
    const userMsg = { role: 'user', text: rawText };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const data = await sendMessage(npcData.npcId, rawText);

      if (data.debug) {
        window.dispatchEvent(new CustomEvent('debug-update', {
          detail: { debug: data.debug }
        }));
      }

      const npcMsg = { role: 'npc', text: data.reply || data.error || '...' };
      setMessages(prev => [...prev, npcMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'npc', text: "Something broke. Try again." }]);
      console.error("Chat failed:", e);
    }
    setLoading(false);
  }

  function handleSend() {
    executeSend(input);
  }

  function handleLeave() {
    setMessages([]);
    window.dispatchEvent(new CustomEvent('dialogue-close'));
    onClose();
  }

  function handleKeyDown(e) {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:pb-6 pointer-events-auto">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity" onClick={handleLeave} />

      {/* Cinematic RPG Dialog Window */}
      <div className="relative w-full max-w-3xl bg-slate-900/90 backdrop-blur-2xl border-t sm:border border-slate-700/60 sm:rounded-2xl shadow-2xl shadow-black/80 flex flex-col max-h-[82vh] overflow-hidden">
        
        {/* Top Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60 bg-gradient-to-r from-slate-900/80 via-slate-850 to-slate-900/80">
          <div className="flex items-center gap-4">
            {/* Hologram Avatar Frame */}
            <div className="relative w-13 h-13 rounded-2xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 p-0.5 shadow-lg shadow-amber-500/10">
              <div className="w-12 h-12 rounded-[14px] bg-slate-800 flex items-center justify-center text-3xl border border-slate-600/50">
                {npcData.portrait}
              </div>
              <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-slate-900" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-amber-300 font-extrabold text-lg tracking-wide">{npcData.npcName}</h3>
                <span className="bg-amber-500/15 border border-amber-500/30 text-amber-400 font-mono text-[11px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {npcData.role}
                </span>
              </div>
              <p className="text-slate-400 text-xs mt-0.5 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-cyan-400" /> Cognitive Persona Active
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {npcData.npcId === 'alaric' && (
              <button
                onClick={() => setShopOpen(!shopOpen)}
                className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-3 py-1.5 rounded-lg text-xs font-semibold transition shadow-sm"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                {shopOpen ? 'Chat' : 'Catalog'}
              </button>
            )}

            <button
              onClick={handleLeave}
              className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition"
              title="Close Dialogue (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Alaric Shop Catalog Drawer */}
        {shopOpen && npcData.npcId === 'alaric' ? (
          <div className="p-6 overflow-y-auto max-h-[350px] space-y-3 bg-slate-950/40">
            <h4 className="text-xs font-mono uppercase tracking-wider text-slate-400">Merchant Stock (Click to buy)</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {[
                { name: 'iron dagger', price: '1 silver', desc: 'Light concealed blade' },
                { name: 'steel dagger', price: '2 silver', desc: 'Reinforced soldier blade' },
                { name: 'iron sword', price: '3 silver', desc: 'Standard infantry steel' },
                { name: 'whetstone', price: '1 silver', desc: 'Sharpens battle gear' },
                { name: 'torch', price: '1 silver', desc: 'Pack of 3 illumination torches' },
                { name: 'rope', price: '3 silver', desc: '10ft climbing cord' },
              ].map((item, i) => (
                <button
                  key={i}
                  onClick={() => {
                    executeSend('buy ' + item.name);
                    setShopOpen(false);
                  }}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-850/80 hover:bg-amber-500/10 border border-slate-700 hover:border-amber-500/40 text-left transition group"
                >
                  <div>
                    <div className="text-slate-200 font-bold text-sm group-hover:text-amber-300 capitalize">{item.name}</div>
                    <div className="text-slate-400 text-xs">{item.desc}</div>
                  </div>
                  <span className="bg-amber-500/20 text-amber-300 text-xs font-mono font-bold px-2.5 py-1 rounded-md border border-amber-500/30">
                    {item.price}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Messages Area */
          <div className="flex-1 overflow-y-auto custom-scroll px-6 py-5 space-y-3.5 min-h-[220px] max-h-[360px]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-32 text-center text-slate-500 text-sm">
                <MessageSquare className="w-8 h-8 text-slate-600 mb-2 opacity-60" />
                <span className="italic">Begin your conversation with {npcData.npcName}...</span>
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div
                  className={`max-w-[82%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-md ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-600/80 to-blue-600/80 text-white rounded-br-none border border-indigo-400/30'
                      : 'bg-slate-800/90 text-slate-200 rounded-bl-none border border-slate-700/80'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-slate-800/80 px-4 py-3 rounded-2xl rounded-bl-none border border-slate-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="px-6 py-2 bg-slate-950/50 border-t border-slate-800/80 flex items-center gap-2 overflow-x-auto custom-scroll">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 whitespace-nowrap">Suggested:</span>
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              disabled={loading}
              onClick={() => executeSend(chip)}
              className="bg-slate-800/90 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 hover:border-amber-500/30 text-xs px-2.5 py-1 rounded-full whitespace-nowrap transition disabled:opacity-50"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Dock */}
        <div className="px-6 py-3.5 border-t border-slate-700/60 bg-slate-900/90 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Speak to ${npcData.npcName}...`}
            className="flex-1 bg-slate-950/70 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/30 transition shadow-inner"
            autoFocus
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition flex items-center gap-1.5 shadow-lg shadow-amber-500/20"
          >
            <Send className="w-4 h-4" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}
