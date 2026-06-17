import os
import json
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# YOUR SERVER IS ON PORT 8085
LLAMA_SERVER_URL = "http://localhost:8085/v1/chat/completions"

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    player_text = data.get("player_text", "")
    
    # Load character baseline
    with open("npcs/merchant.json", "r") as f:
        npc = json.load(f)
    
    # Build system prompt
    system_prompt = f"You are {npc['name']}, a {npc['role']}. Personality: {npc['personality']}. Stay in character."
    
    # Payload for llama.cpp server
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
        
        return jsonify({
            "reply": npc_reply,
            "debug": {
                "raw_prompt_sent": system_prompt,
                "intent_detected": "None (Week 1 Skeleton)",
                "mood_score": 0.5
            }
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)