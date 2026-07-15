def build_inner_monologue(npc, facts, mood, intent, behavior_rules, surprise=False):
    """Build what the NPC FEELS, not what they should do."""
    thoughts = []
    
    name = facts.get("player_name", [None])[0]
    
    if name:
        if mood > 0.6:
            thoughts.append(f"{name} again. Regular.")
        elif mood > 0.3:
            thoughts.append(f"{name}. The one who was rude.")
        else:
            thoughts.append(f"{name}. Trouble.")
    else:
        thoughts.append("New face.")
    
    if mood > 0.7:
        thoughts.append("Don't mind this one.")
    elif mood > 0.4:
        thoughts.append("Watching.")
    elif mood > 0.2:
        thoughts.append("Annoyed.")
    else:
        thoughts.append("Want them gone.")
    
    if intent == "trade":
        thoughts.append("Wants to buy.")
    elif intent == "hostile":
        thoughts.append("Being rude.")
    elif intent == "quest":
        thoughts.append("Asking for favors.")
    elif intent == "friendly":
        thoughts.append("Being nice. Why?")
    
    if surprise:
        thoughts.append("They make no sense. Confusing statement. Suspicious.")
    
    return thoughts


def format_facts(facts):
    """Convert facts dict to readable string."""
    if not facts:
        return "Nothing yet."
    
    lines = []
    for fact_type, values in facts.items():
        if fact_type == "player_name":
            lines.append(f"Player's name is {values[0]}.")
        elif fact_type == "trust":
            lines.append(f"Player is: {', '.join(values)}.")
        elif fact_type == "likes":
            lines.append(f"Player likes: {', '.join(values)}.")
        elif fact_type == "deal":
            lines.append(f"Past deals: {', '.join(values)}.")
        else:
            lines.append(f"{fact_type}: {', '.join(values)}.")
    
    return " ".join(lines)


def format_history(memories, max_turns=3):
    """Get last N conversation turns."""
    if not memories or len(memories) == 0:
        return "No prior conversation."
    
    recent = memories[-max_turns * 2:]
    return "\n".join([m['text'] for m in recent])


def build_system_prompt(npc, thoughts, intent, facts, memories, behavior_rules, surprise=False):
    monologue = " ".join(thoughts)
    speech_pattern = npc.get('speech_pattern', 'Respond in 1-2 sentences. Be concise.')
    
    if surprise:
        speech_pattern += " You are confused and highly suspicious of their last statement. Ask them what they mean, remaining strictly in character."
    
    facts_text = format_facts(facts)
    history_text = format_history(memories)
    
    # Add inventory if exists
    inventory_text = ""
    if 'inventory' in npc:
        items = [f"{item}: {price}" for item, price in npc['inventory'].items()]
        inventory_text = "\nYour prices:\n" + "\n".join(items)
    
    behavior_hint = ""
    if behavior_rules:
        rules = [f"- {k}: {v}" for k, v in behavior_rules.items()]
        behavior_hint = "\nLearned patterns:\n" + "\n".join(rules)
    
    prompt = f"""You are {npc['name']}, a {npc['role']}. {npc['personality']}

Right now: {monologue}

Facts you remember: {facts_text}

Recent conversation:
{history_text}{inventory_text}{behavior_hint}

{speech_pattern}

CRITICAL RULES:
- Use the facts above. NEVER make up information not listed.
- If asked something you know, answer directly using the fact.
- If asked something you don't know, say so briefly.
- NEVER repeat your previous response word-for-word.
- Vary your wording each time. NEVER say the exact same sentence twice.
- Stay in character. NEVER exceed the word limit."""

    return prompt