import os
import json
import sqlite3
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

from memory.memory import add_memory, get_relevant_memories, clear_memories, get_all_memories
from relationship import get_mood, update_mood, get_facts, get_behavior_rules, extract_facts, update_behavior, get_situation_facts, DB_PATH, init_db
from intent_classifier import classify_intent
from intent_comparison import compare_intent_classifiers  # Add this
from persona_engine import build_inner_monologue, build_system_prompt

# Load Autoencoder (CO4)
import torch
from autoencoder import Autoencoder
from memory.memory import embedder

AUTOENCODER_MODEL_PATH = "models/autoencoder.pt"
AUTOCODER_CONFIG_PATH = "data/autoencoder_config.json"

autoencoder = None
surprise_threshold = 0.001420  # Fallback

if os.path.exists(AUTOENCODER_MODEL_PATH) and os.path.exists(AUTOCODER_CONFIG_PATH):
    try:
        with open(AUTOCODER_CONFIG_PATH, "r") as f:
            ae_config = json.load(f)
        surprise_threshold = ae_config.get("surprise_threshold", 0.001420)
        
        autoencoder = Autoencoder(input_dim=ae_config.get("input_dim", 384), latent_dim=ae_config.get("latent_dim", 32))
        autoencoder.load_state_dict(torch.load(AUTOENCODER_MODEL_PATH, map_location="cpu"))
        autoencoder.eval()
        print(f"Loaded Autoencoder with surprise threshold: {surprise_threshold}")
    except Exception as e:
        print(f"Error loading Autoencoder: {e}")

app = Flask(__name__)
CORS(app)

LLAMA_SERVER_URL = "http://localhost:8085/v1/chat/completions"

# List of all NPC IDs
ALL_NPCS = ['alaric', 'borin', 'vexis', 'mira']

# PLAYER INVENTORY — must be at TOP, before any endpoint uses it
player_inventory = {
    "coins": 10,
    "items": []
}

# ========== BUY ENDPOINT ==========
@app.route('/buy', methods=['POST'])
def buy():
    data = request.json
    npc_id = data.get("npc_id")
    item = data.get("item", "").lower().strip()
    
    with open(f"npcs/{npc_id}.json", "r") as f:
        npc = json.load(f)
    
    price_str = npc.get("inventory", {}).get(item)
    if not price_str:
        return jsonify({"error": "Don't sell that."}), 400  # ← jsonify + status code
    
    try:
        price = int(price_str.split()[0])
    except:
        return jsonify({"error": "Price unclear."}), 400
    
    if player_inventory["coins"] < price:
        return jsonify({"error": f"Need {price} silver. You have {player_inventory['coins']}."}), 400
    
    # Transaction
    player_inventory["coins"] -= price
    player_inventory["items"].append(item)
    
    add_memory(npc_id, f"deal:{item}:{price} coin")
    
    return jsonify({  # ← jsonify here too
        "success": True,
        "item": item,
        "price": price,
        "coins_left": player_inventory["coins"],
        "inventory": player_inventory["items"]
    })

# ========== PLAYER STATS ENDPOINT ==========
@app.route('/player', methods=['GET'])
def get_player():
    return jsonify(player_inventory)

# ========== CHAT ENDPOINT ==========
@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    npc_id = data.get("npc_id", "alaric")
    player_text = data.get("player_text", "")
    
    # Load NPC
    with open(f"npcs/{npc_id}.json", "r") as f:
        npc = json.load(f)
    
    # Classify intent
    intent_result = compare_intent_classifiers(player_text)  # Logs + returns same result
    intent = intent_result['intent']
    
    if intent == "quest" and any(phrase in player_text.lower() for phrase in ["my name", "who am i", "what is my name"]):
        intent = "friendly"
        
    # Calculate Autoencoder reconstruction loss for cognitive surprise (CO4, CO5)
    surprise = False
    reconstruction_loss = 0.0
    if autoencoder is not None:
        try:
            with torch.no_grad():
                emb = embedder.encode(player_text, convert_to_numpy=True)
                emb_tensor = torch.tensor([emb], dtype=torch.float32)
                reconstructed = autoencoder(emb_tensor)
                loss_tensor = torch.mean((reconstructed - emb_tensor) ** 2)
                reconstruction_loss = float(loss_tensor.item())
                
                if reconstruction_loss > surprise_threshold:
                    surprise = True
                    print(f"COGNITIVE SURPRISE TRIGGERED! Loss: {reconstruction_loss:.6f} > Threshold: {surprise_threshold:.6f}")
        except Exception as e:
            print(f"Error calculating Autoencoder surprise: {e}")
            
    if surprise:
        # Surprise decreases mood slightly (confuses the NPC) unless they are already hostile
        if intent != "hostile":
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("UPDATE relationships SET mood_score = max(0.0, mood_score - 0.05) WHERE npc_id = ?", (npc_id,))
            conn.commit()
            conn.close()
    
    mood = get_mood(npc_id)
    facts = get_facts(npc_id)
    behavior_rules = get_behavior_rules(npc_id)
    memories = get_all_memories(npc_id)
    
    # === MEMORY CONSOLIDATION LOGIC (Forgetting routine, keeping surprise) ===
    # Keep the last 4 turns for immediate context, plus any older turns flagged as "is_core" (surprise triggers)
    core_memories = [m for m in memories[:-4] if m.get('is_core', False)] if len(memories) > 4 else []
    recent_memories = memories[-4:] if memories else []
    
    # Combine and preserve chronological order using timestamp
    consolidated_memories = core_memories + [m for m in recent_memories if m not in core_memories]
    consolidated_memories = sorted(consolidated_memories, key=lambda x: x.get('timestamp', ''))
    
    thoughts = build_inner_monologue(npc, facts, mood, intent, behavior_rules, surprise=surprise)
    system_prompt = build_system_prompt(npc, thoughts, intent, facts, consolidated_memories, behavior_rules, surprise=surprise)
    
    # Build messages with history using consolidated_memories
    messages = [{"role": "system", "content": system_prompt}]
    
    for mem in consolidated_memories:
        if mem['text'].startswith('Player:'):
            messages.append({"role": "user", "content": mem['text'][7:].strip()})
        else:
            npc_text = mem['text']
            if ':' in npc_text:
                npc_text = npc_text.split(':', 1)[1].strip()
            messages.append({"role": "assistant", "content": npc_text})
    
    messages.append({"role": "user", "content": player_text})
    
    payload = {
        "model": "gemma",
        "messages": messages,
        "temperature": 0.7
    }
    
    try:
        response = requests.post(LLAMA_SERVER_URL, json=payload)
        response_data = response.json()
        npc_reply = response_data["choices"][0]["message"]["content"]
        
        from datetime import datetime
        metadata = {
            "timestamp": datetime.now().isoformat(),
            "is_core": surprise,
            "salience": reconstruction_loss
        }
        add_memory(npc_id, f"Player: {player_text}", metadata=metadata)
        add_memory(npc_id, f"{npc['name']}: {npc_reply}", metadata=metadata)
        
        extract_facts(npc_id, player_text, npc_reply)
        facts = get_facts(npc_id)
        new_mood = update_mood(npc_id, intent)
        update_behavior(npc_id, intent, new_mood)
        new_thoughts = build_inner_monologue(npc, facts, new_mood, intent, behavior_rules, surprise=surprise)
        
        return jsonify({
            "reply": npc_reply,
            "debug": {
                "npc_id": npc_id,
                "intent_detected": f"{intent} (confidence: {intent_result['confidence']})",
                "mood_score": round(new_mood, 2),
                "thoughts": new_thoughts,
                "facts": facts,
                "behavior_rules": behavior_rules,
                "surprise_score": round(reconstruction_loss, 6),
                "surprise_triggered": surprise
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
@app.route('/npc-chat', methods=['POST'])
def npc_chat_loop():
    """Trigger a 3-turn multi-agent dialogue exchange between NPC 1 and NPC 2."""
    data = request.json or {}
    npc1_id = data.get("npc_id_1")
    npc2_id = data.get("npc_id_2")
    
    if not npc1_id or not npc2_id:
        return jsonify({"error": "Must provide npc_id_1 and npc_id_2"}), 400
        
    try:
        # Load NPC data
        with open(f"npcs/{npc1_id}.json", "r") as f:
            npc1 = json.load(f)
        with open(f"npcs/{npc2_id}.json", "r") as f:
            npc2 = json.load(f)
            
        # Get moods and rules
        mood1 = get_mood(npc1_id)
        mood2 = get_mood(npc2_id)
        facts1 = get_facts(npc1_id)
        facts2 = get_facts(npc2_id)
        rules1 = get_behavior_rules(npc1_id)
        rules2 = get_behavior_rules(npc2_id)
        
        # Turn 1: NPC 1 initiates (e.g. Borin opens a dialogue to check Alaric's shop)
        thoughts1 = f"{npc1['name']} checks up on {npc2['name']}'s shop as part of a routine guard patrol."
        prompt1 = build_system_prompt(npc1, thoughts1, "friendly", facts1, get_all_memories(npc1_id), rules1)
        
        # Prompt Borin to start
        payload1 = {
            "model": "gemma",
            "messages": [
                {"role": "system", "content": prompt1},
                {"role": "user", "content": f"Initiate a brief conversation with {npc2['name']} about the state of the village or shop. Keep it under 15 words and strictly in character."}
            ],
            "temperature": 0.7
        }
        res1 = requests.post(LLAMA_SERVER_URL, json=payload1).json()
        turn1_text = res1["choices"][0]["message"]["content"].strip()
        
        # Turn 2: NPC 2 responds
        thoughts2 = f"{npc1['name']} has just asked {npc2['name']}: '{turn1_text}'."
        prompt2 = build_system_prompt(npc2, thoughts2, "friendly", facts2, get_all_memories(npc2_id), rules2)
        
        payload2 = {
            "model": "gemma",
            "messages": [
                {"role": "system", "content": prompt2},
                {"role": "user", "content": f"{npc1['name']} says to you: '{turn1_text}'. Respond to them briefly, keeping it under 15 words and strictly in character."}
            ],
            "temperature": 0.7
        }
        res2 = requests.post(LLAMA_SERVER_URL, json=payload2).json()
        turn2_text = res2["choices"][0]["message"]["content"].strip()
        
        # Turn 3: NPC 1 concludes
        thoughts1_end = f"{npc2['name']} responded with: '{turn2_text}'."
        prompt1_end = build_system_prompt(npc1, thoughts1_end, "friendly", facts1, get_all_memories(npc1_id), rules1)
        
        payload3 = {
            "model": "gemma",
            "messages": [
                {"role": "system", "content": prompt1_end},
                {"role": "user", "content": f"{npc2['name']} replied: '{turn2_text}'. Conclude this brief exchange in character under 15 words."}
            ],
            "temperature": 0.7
        }
        res3 = requests.post(LLAMA_SERVER_URL, json=payload3).json()
        turn3_text = res3["choices"][0]["message"]["content"].strip()
        
        # Log to vector database so they both remember this interaction
        from datetime import datetime
        metadata = {"timestamp": datetime.now().isoformat(), "is_core": False, "salience": 0.0}
        
        # Add Borin's memory
        add_memory(npc1_id, f"{npc1['name']}: {turn1_text}", metadata=metadata)
        add_memory(npc1_id, f"{npc2['name']}: {turn2_text}", metadata=metadata)
        add_memory(npc1_id, f"{npc1['name']}: {turn3_text}", metadata=metadata)
        
        # Add Alaric's memory
        add_memory(npc2_id, f"{npc1['name']}: {turn1_text}", metadata=metadata)
        add_memory(npc2_id, f"{npc2['name']}: {turn2_text}", metadata=metadata)
        add_memory(npc2_id, f"{npc1['name']}: {turn3_text}", metadata=metadata)
        
        # Return transcript
        return jsonify({
            "transcript": [
                {"speaker": npc1_id, "name": npc1['name'], "text": turn1_text},
                {"speaker": npc2_id, "name": npc2['name'], "text": turn2_text},
                {"speaker": npc1_id, "name": npc1['name'], "text": turn3_text}
            ]
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(port=5000, debug=True)
