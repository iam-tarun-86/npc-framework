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
    if (!input.trim()) return;
    setLoading(true);
    
    const userMsg = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    
    const data = await sendMessage(npcData.npcId, input);
    
    if (data.debug) {
      window.dispatchEvent(new CustomEvent('debug-update', { 
        detail: { debug: data.debug } 
      }));
    }
    
    const npcMsg = { role: 'npc', text: data.reply || data.error || '...' };
    setMessages(prev => [...prev, npcMsg]);
    setInput('');
    setLoading(false);
  }

  function handleLeave() {
    setMessages([]);
    window.dispatchEvent(new CustomEvent('dialogue-close'));
    onClose();
  }

  function handleKeyDown(e) {
    // Stop ALL keys from reaching Phaser
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
    <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50">
      <div className="bg-gray-800 w-full max-w-2xl rounded-t-2xl p-6 max-h-[70vh] flex flex-col">
        <div className="flex items-center gap-3 mb-4 border-b border-gray-700 pb-3">
          <div className="text-4xl">{npcData.portrait}</div>
          <div>
            <h3 className="text-amber-400 font-bold">{npcData.npcName}</h3>
            <p className="text-gray-400 text-sm">{npcData.role}</p>
          </div>
          <button onClick={handleLeave} className="ml-auto text-gray-400 hover:text-white">
            ✕ Leave
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 mb-4 min-h-[200px]">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-3 rounded-lg ${
                msg.role === 'user' ? 'bg-blue-900 text-right' : 'bg-gray-700'
              }`}>
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div className="bg-gray-700 p-3 rounded-lg max-w-[80%] animate-pulse">
              {npcData.npcName} is thinking...
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            placeholder={`Speak to ${npcData.npcName}...`}
            className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-amber-400"
            autoFocus
          />
          <button onClick={handleSend} disabled={loading}
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-bold disabled:opacity-50">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
