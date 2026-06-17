import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

from memory.memory import add_memory, get_relevant_memories
from relationship import get_mood, update_mood
from intent_classifier import classify_intent  # NEW

app = Flask(__name__)
CORS(app)

LLAMA_SERVER_URL = "http://localhost:8085/v1/chat/completions"

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    npc_id = data.get("npc_id", "merchant_01")
    player_text = data.get("player_text", "")
    
    # Load NPC persona
    with open(f"npcs/merchant.json", "r") as f:
        npc = json.load(f)
    
    # REAL INTENT CLASSIFICATION (DistilBERT)
    intent_result = classify_intent(player_text)
    intent = intent_result['intent']
    
    # Retrieve relevant memories (ATTENTION MECHANISM)
    memories = get_relevant_memories(npc_id, player_text, n_results=3)
    memory_block = "\n".join([f"- {m}" for m in memories]) if memories else "No prior memories."
    
    # Get current relationship mood
    mood = get_mood(npc_id)
    mood_desc = "friendly" if mood > 0.6 else "neutral" if mood > 0.3 else "hostile"
    
    # Build enriched prompt
    system_prompt = f"""You are {npc['name']}, a {npc['role']}. 
Personality: {npc['personality']}.
Current mood toward player: {mood_desc} (score: {mood:.2f}).
Player intent detected: {intent}.
Relevant past interactions:
{memory_block}
Stay in character. Reference memories naturally if relevant. React to the player's intent."""
    
    payload = {
        "model": "qwen",
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": player_text}
        ],
        "temperature": 0.7
    }
    
    try:
        response = requests.post(LLAMA_SERVER_URL, json=payload)
        response_data = response.json()
        npc_reply = response_data["choices"][0]["message"]["content"]
        
        # Save this interaction to memory
        add_memory(npc_id, f"Player: {player_text}")
        add_memory(npc_id, f"{npc['name']}: {npc_reply}")
        
        # Update mood based on REAL intent
        new_mood = update_mood(npc_id, intent)
        
        return jsonify({
            "reply": npc_reply,
            "debug": {
                "raw_prompt_sent": system_prompt,
                "intent_detected": f"{intent} (confidence: {intent_result['confidence']})",
                "mood_score": round(new_mood, 2),
                "memories_used": memories
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)