def build_inner_monologue(npc, facts, mood, intent, behavior_rules):
    """Build what Alaric FEELS, not what he should do."""
    thoughts = []
    
    name = facts.get("player_name", [None])[0]
    
    # Base recognition
    if name:
        if mood > 0.6:
            thoughts.append(f"{name} again. Regular.")
        elif mood > 0.3:
            thoughts.append(f"{name}. The one who was rude.")
        else:
            thoughts.append(f"{name}. Trouble.")
    else:
        thoughts.append("New face.")
    
    # Mood as feeling, not label
    if mood > 0.7:
        thoughts.append("Don't mind this one.")
    elif mood > 0.4:
        thoughts.append("Watching.")
    elif mood > 0.2:
        thoughts.append("Annoyed.")
    else:
        thoughts.append("Want them gone.")
    
    # Intent as situation
    if intent == "trade":
        thoughts.append("Wants to buy.")
    elif intent == "hostile":
        thoughts.append("Being rude.")
    elif intent == "quest":
        thoughts.append("Asking for favors.")
    elif intent == "friendly":
        thoughts.append("Being nice. Why?")
    
    return thoughts

def build_system_prompt(npc, thoughts, intent):
    """Minimal prompt — let the model be human."""
    monologue = " ".join(thoughts)  # Flowing thoughts, not bullet points
    
    prompt = f"""You are {npc['name']}, a {npc['role']}. {npc['personality']}

Right now: {monologue}

Respond naturally. Don't explain yourself."""
    
    return prompt