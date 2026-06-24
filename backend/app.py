import os
import json
import sqlite3
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

from memory.memory import add_memory, get_relevant_memories, clear_memories, get_all_memories
from relationship import get_mood, update_mood, get_facts, get_behavior_rules, extract_facts, update_behavior, get_situation_facts, DB_PATH, init_db
from intent_classifier import classify_intent
from persona_engine import build_inner_monologue, build_system_prompt

app = Flask(__name__)
CORS(app)

LLAMA_SERVER_URL = "http://localhost:8085/v1/chat/completions"

# List of all NPC IDs
ALL_NPCS = ['alaric', 'borin', 'vexis', 'mira']

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    npc_id = data.get("npc_id", "alaric")
    player_text = data.get("player_text", "")
    
    # Load NPC
    with open(f"npcs/{npc_id}.json", "r") as f:
        npc = json.load(f)
    
    # Classify intent
    intent_result = classify_intent(player_text)
    intent = intent_result['intent']
    
    if intent == "quest" and any(phrase in player_text.lower() for phrase in ["my name", "who am i", "what is my name"]):
        intent = "friendly"
    
    mood = get_mood(npc_id)
    facts = get_facts(npc_id)
    behavior_rules = get_behavior_rules(npc_id)
    memories = get_all_memories(npc_id)  # ← Clean: one fetch
    
    thoughts = build_inner_monologue(npc, facts, mood, intent, behavior_rules)
    system_prompt = build_system_prompt(npc, thoughts, intent, facts, memories, behavior_rules)
    
    # Build messages with history
    messages = [{"role": "system", "content": system_prompt}]

    recent_memories = memories[-4:] if memories else []
    for mem in recent_memories:
        if mem['text'].startswith('Player:'):
            messages.append({"role": "user", "content": mem['text'][7:].strip()})
        else:
            npc_text = mem['text']
            if ':' in npc_text:
                npc_text = npc_text.split(':', 1)[1].strip()
            messages.append({"role": "assistant", "content": npc_text})
    
    messages.append({"role": "user", "content": player_text})
    
    # ... rest same
    
    payload = {
        "model": "gemma",
        "messages": messages,
        "temperature": 0.7
    }
    
    try:
        response = requests.post(LLAMA_SERVER_URL, json=payload)
        response_data = response.json()
        npc_reply = response_data["choices"][0]["message"]["content"]
        
        add_memory(npc_id, f"Player: {player_text}")
        add_memory(npc_id, f"{npc['name']}: {npc_reply}")
        
        extract_facts(npc_id, player_text, npc_reply)
        facts = get_facts(npc_id)
        new_mood = update_mood(npc_id, intent)
        update_behavior(npc_id, intent, new_mood)
        new_thoughts = build_inner_monologue(npc, facts, new_mood, intent, behavior_rules)
        
        return jsonify({
            "reply": npc_reply,
            "debug": {
                "npc_id": npc_id,
                "intent_detected": f"{intent} (confidence: {intent_result['confidence']})",
                "mood_score": round(new_mood, 2),
                "thoughts": new_thoughts,
                "facts": facts,
                "behavior_rules": behavior_rules
            }
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/all-memories', methods=['GET'])
def get_all_npc_memories():
    """Get memories and stats for ALL NPCs."""
    try:
        init_db()
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        result = {}
        for npc_id in ALL_NPCS:
            memories = get_all_memories(npc_id)
            
            c.execute("SELECT mood_score, interaction_count FROM relationships WHERE npc_id = ?", (npc_id,))
            row = c.fetchone()
            mood = row[0] if row else 0.5
            count = row[1] if row else 0
            
            c.execute("SELECT fact_type, fact_value FROM facts WHERE npc_id = ?", (npc_id,))
            facts_rows = c.fetchall()
            facts = {}
            for ft, fv in facts_rows:
                if ft not in facts:
                    facts[ft] = []
                facts[ft].append(fv)
            
            try:
                with open(f"npcs/{npc_id}.json", "r") as f:
                    npc_data = json.load(f)
                    name = npc_data.get('name', npc_id)
                    role = npc_data.get('role', 'Unknown')
            except:
                name = npc_id
                role = 'Unknown'
            
            result[npc_id] = {
                'name': name,
                'role': role,
                'mood': round(mood, 2),
                'interaction_count': count,
                'facts': facts,
                'memories': memories,
                'last_message': memories[-1]['text'] if memories else 'No conversation yet'
            }
        
        conn.close()
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/memories', methods=['POST'])
def get_memories():
    data = request.json
    npc_id = data.get("npc_id", "alaric")
    
    try:
        memories = get_all_memories(npc_id)
        return jsonify({"memories": memories})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/clear-memory', methods=['POST'])
def clear_memory():
    data = request.json
    npc_id = data.get("npc_id", "alaric")
    
    try:
        clear_memories(npc_id)
        
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("DELETE FROM facts WHERE npc_id = ?", (npc_id,))
        c.execute("DELETE FROM behavior_rules WHERE npc_id = ?", (npc_id,))
        c.execute("UPDATE relationships SET mood_score = 0.5, interaction_count = 0 WHERE npc_id = ?", (npc_id,))
        conn.commit()
        conn.close()
        
        return jsonify({"message": f"Memory cleared for {npc_id}"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route('/clear-all-memories', methods=['POST'])
def clear_all_memories():
    """MASTER CLEAR: Delete ALL memories for ALL NPCs."""
    data = request.json or {}
    confirm = data.get("confirm", False)
    
    if not confirm:
        return jsonify({"error": "Send confirm: true to wipe all memories"}), 400
    
    try:
        cleared = []
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        
        for npc_id in ALL_NPCS:
            # Clear ChromaDB
            clear_memories(npc_id)
            
            # Clear SQLite
            c.execute("DELETE FROM facts WHERE npc_id = ?", (npc_id,))
            c.execute("DELETE FROM behavior_rules WHERE npc_id = ?", (npc_id,))
            c.execute("UPDATE relationships SET mood_score = 0.5, interaction_count = 0 WHERE npc_id = ?", (npc_id,))
            cleared.append(npc_id)
        
        conn.commit()
        conn.close()
        
        return jsonify({
            "message": "ALL memories wiped",
            "cleared_npcs": cleared,
            "total": len(cleared)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)
