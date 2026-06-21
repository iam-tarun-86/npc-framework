import { useState, useEffect, useRef } from 'react';
import { sendMessage } from '../api';

export default function DialogueOverlay({ npcData, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    inputRef.current?.focus();
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;
    const userText = input.trim();
    setInput('');
    setLoading(true);

    const userMsg = { role: 'user', text: userText };
    setMessages(prev => [...prev, userMsg]);

    const data = await sendMessage(npcData.npcId, userText);

    if (data.debug) {
      window.dispatchEvent(new CustomEvent('debug-update', {
        detail: { debug: data.debug }
      }));
    }

    const npcMsg = { role: 'npc', text: data.reply || data.error || '...' };
    setMessages(prev => [...prev, npcMsg]);
    setLoading(false);
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

  function handleKeyUp(e) {
    e.stopPropagation();
  }

  return (
    <div className="fixed inset-0 z-50 animate-slide-up">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleLeave} />

      {/* Dialogue Panel */}
      <div className="absolute inset-x-0 bottom-0 flex justify-center">
        <div className="w-full max-w-2xl bg-slate-900/95 border-t border-amber-500/20 shadow-2xl shadow-black/50 rounded-t-2xl flex flex-col max-h-[70vh]">

          {/* Header */}
          <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-slate-700/50">
            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-3xl border border-amber-500/30">
              {npcData.portrait}
            </div>
            <div className="flex-1">
              <h3 className="text-amber-400 font-bold text-lg leading-tight">{npcData.npcName}</h3>
              <p className="text-slate-400 text-sm">{npcData.role}</p>
            </div>
            <button
              onClick={handleLeave}
              className="text-slate-400 hover:text-white transition-colors p-1"
            >
              ✕ Leave
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto custom-scroll px-6 py-4 space-y-3 min-h-[200px]">
            {messages.length === 0 && (
              <div className="text-center text-slate-500 text-sm mt-10 italic">
                The conversation begins...
              </div>
            )}

            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div className={`max-w-[80%] px-4 py-2.5 rounded-lg text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-900/40 text-blue-100 border border-blue-500/20'
                    : 'bg-slate-700/50 text-slate-200 border-l-2 border-amber-500/50'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-slate-700/50 px-4 py-2.5 rounded-lg border-l-2 border-amber-500/30">
                  <div className="flex gap-1 items-center">
                    <span className="w-2 h-2 bg-amber-400/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-amber-400/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-amber-400/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>

          {/* Input */}
          <div className="px-6 py-4 border-t border-slate-700/50 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              placeholder={`Speak to ${npcData.npcName}...`}
              className="flex-1 bg-slate-800/80 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
              autoFocus
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-slate-900 font-bold px-6 py-2.5 rounded-lg text-sm transition-colors"
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}