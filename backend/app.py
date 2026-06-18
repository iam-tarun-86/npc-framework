import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

from memory.memory import add_memory, get_relevant_memories
from relationship import get_mood, update_mood, get_facts, get_behavior_rules, extract_facts, update_behavior
from intent_classifier import classify_intent

app = Flask(__name__)
CORS(app)

LLAMA_SERVER_URL = "http://localhost:8085/v1/chat/completions"

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    npc_id = data.get("npc_id", "merchant_01")
    player_text = data.get("player_text", "")
    
    # Load NPC
    with open(f"npcs/merchant.json", "r") as f:
        npc = json.load(f)
    
    # Classify intent
    intent_result = classify_intent(player_text)
    intent = intent_result['intent']
    
    # FIX: Name questions are friendly, not quest
    if intent == "quest" and any(phrase in player_text.lower() for phrase in ["my name", "who am i", "what is my name"]):
        intent = "friendly"
    
    # Get mood
    mood = get_mood(npc_id)
    
    # Get episodic memories
    memories = get_relevant_memories(npc_id, player_text, n_results=3)
    
    # Get semantic facts
    facts = get_facts(npc_id)
    
    # Get procedural behavior
    behavior_rules = get_behavior_rules(npc_id)
    
    # Build character sheet (persistent facts)
       # Build character sheet
    name = facts.get("player_name", [None])[0]
    trust_events = facts.get("trust", [])
    
    situation = []
    if name:
        situation.append(f"Customer: {name}")
    if "was_rude" in trust_events:
        situation.append("They insulted you")
    if "paid_money" in trust_events:
        situation.append("They paid before")
    
    if mood > 0.7:
        situation.append("You tolerate them")
    elif mood > 0.4:
        situation.append("You watch them")
    elif mood > 0.2:
        situation.append("You're annoyed")
    else:
        situation.append("You want them gone")
    
    situation_block = "\n".join([f"- {s}" for s in situation])
    
    # FEW-SHOT SYSTEM PROMPT for Gemma 8B
    system_prompt = f"""You are Alaric, a grizzled merchant. You survived three wars. You trust no one.

Current situation:
{situation_block}

How you talk:
- Q: Who are you? A: Alaric. Sell steel. Coin or out.
- Q: My name is Sarah A: Sarah. Don't care. Buy or leave.
- Q: I want a sword A: Steel. Good price. Coin first.
- Q: You're ugly A: ...Get out.

Now respond to the player. Short. Bitter. One or two sentences."""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": player_text}
    ]
    
    payload = {
        "model": "gemma",
        "messages": messages,
        "temperature": 0.8,
    }
    
    try:
        response = requests.post(LLAMA_SERVER_URL, json=payload)
        response_data = response.json()
        npc_reply = response_data["choices"][0]["message"]["content"]
        
        # Only save important interactions
        if intent in ["hostile", "trade"] or "my name is" in player_text.lower():
            add_memory(npc_id, f"Player: {player_text}")
            add_memory(npc_id, f"{npc['name']}: {npc_reply}")
        
        # Extract semantic facts
        extract_facts(npc_id, player_text, npc_reply)
        
        # Update mood
        new_mood = update_mood(npc_id, intent)
        
        # Learn behavior
        update_behavior(npc_id, intent, new_mood)
        
        return jsonify({
            "reply": npc_reply,
            "debug": {
                "intent_detected": f"{intent} (confidence: {intent_result['confidence']})",
                "mood_score": round(new_mood, 2),
                "situation": situation,
                "facts": facts,
                "behavior_rules": behavior_rules
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)