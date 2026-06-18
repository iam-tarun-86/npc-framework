import sqlite3
import re
from datetime import datetime

DB_PATH = "db.sqlite"

def init_db():
    """Create all tables if not exist."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Old table - keep it
    c.execute('''
        CREATE TABLE IF NOT EXISTS relationships (
            npc_id TEXT PRIMARY KEY,
            mood_score REAL DEFAULT 0.5,
            interaction_count INTEGER DEFAULT 0
        )
    ''')
    
    # Drop old facts table if exists (to fix schema)
    c.execute('DROP TABLE IF EXISTS facts')
    
    # NEW: Semantic facts table with correct primary key
    c.execute('''
        CREATE TABLE IF NOT EXISTS facts (
            npc_id TEXT,
            fact_type TEXT,
            fact_value TEXT,
            timestamp TEXT,
            PRIMARY KEY (npc_id, fact_type, fact_value)
        )
    ''')
    
    # NEW: Procedural memory
    c.execute('''
        CREATE TABLE IF NOT EXISTS behavior_rules (
            npc_id TEXT,
            trigger TEXT,
            response_style TEXT,
            PRIMARY KEY (npc_id, trigger)
        )
    ''')
    
    conn.commit()
    conn.close()

def get_mood(npc_id):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT mood_score FROM relationships WHERE npc_id = ?", (npc_id,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else 0.5

def update_mood(npc_id, intent_label):
    init_db()
    current = get_mood(npc_id)
    
    adjustments = {
        "friendly": 0.1,
        "hostile": -0.25,  # Was -0.15, now stronger penalty
        "trade": 0.05,
        "quest": 0.05
    }
    
    new_mood = max(0.0, min(1.0, current + adjustments.get(intent_label, 0)))
    
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        INSERT INTO relationships (npc_id, mood_score, interaction_count)
        VALUES (?, ?, 1)
        ON CONFLICT(npc_id) DO UPDATE SET
            mood_score = ?,
            interaction_count = interaction_count + 1
    ''', (npc_id, new_mood, new_mood))
    conn.commit()
    conn.close()
    return new_mood

# ==================== SEMANTIC MEMORY ====================

def extract_facts(npc_id, player_text, npc_reply):
    """Pull out important facts from conversation."""
    facts = []
    # DEBUG: See what Alaric actually says
    print(f"DEBUG NPC_REPLY: '{npc_reply}'")
    print(f"DEBUG PLAYER_TEXT: '{player_text}'")

    print(f"EXTRACT_FACTS CALLED: npc_id={npc_id}, player_text='{player_text}', npc_reply='{npc_reply}'")
    
    # Find name
    name_match = re.search(r"my name is (\w+)", player_text, re.IGNORECASE)
    if name_match:
        facts.append(("player_name", name_match.group(1)))
    
    # Find preferences
    if any(word in player_text.lower() for word in ["sword", "weapon", "blade", "steel"]):
        facts.append(("likes", "weapons"))
    if any(word in player_text.lower() for word in ["quest", "mission", "job", "work", "task"]):
        facts.append(("likes", "quests"))
    if any(word in player_text.lower() for word in ["potion", "heal", "cure", "medicine"]):
        facts.append(("likes", "potions"))
    
    # Find trust events
    rude_words = ["scum", "idiot", "stupid", "worthless", "pathetic", "fool", "hate", "kill", "die"]
    if any(word in player_text.lower() for word in rude_words):
        facts.append(("trust", "was_rude"))
    
    if any(word in player_text.lower() for word in ["buy", "purchase", "coin", "gold", "pay", "money"]):
        facts.append(("trust", "paid_money"))
    
    #NEW: Track deals and prices
    # Detect price mentions in NPC reply (digits OR number words)
    price_patterns = [
        r"(\d+)\s*(silver|gold|copper)",  # "4 silver", "10 gold"
        r"(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty[- ]?\w*)\s*(silver|gold|copper|coin)",  # "six silver", "twenty-five coin"
    ]
    
    price_match = None
    for pattern in price_patterns:
        match = re.search(pattern, npc_reply, re.IGNORECASE)
        if match:
            price_match = match
            break
    
    if price_match:
        price = price_match.group(0)
        item = "unknown"
        if any(word in player_text.lower() for word in ["sword", "blade", "steel"]):
            item = "sword"
        elif any(word in player_text.lower() for word in ["dagger", "knife"]):
            item = "dagger"
        elif any(word in player_text.lower() for word in ["armor", "shield"]):
            item = "armor"
        elif any(word in player_text.lower() for word in ["potion", "heal"]):
            item = "potion"
        
        facts.append(("deal", f"{item}:{price}"))
    
    # Store in database
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    for fact_type, fact_value in facts:
        c.execute('''
            INSERT OR IGNORE INTO facts (npc_id, fact_type, fact_value, timestamp)
            VALUES (?, ?, ?, ?)
        ''', (npc_id, fact_type, fact_value, datetime.now().isoformat()))
    conn.commit()
    conn.close()

def get_facts(npc_id):
    """Get all known facts about this player."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT fact_type, fact_value FROM facts WHERE npc_id = ?", (npc_id,))
    rows = c.fetchall()
    conn.close()
    
    # Convert to dictionary
    facts = {}
    for fact_type, fact_value in rows:
        if fact_type not in facts:
            facts[fact_type] = []
        facts[fact_type].append(fact_value)
    return facts

def get_situation_facts(npc_id, mood):
    """Build contextual facts based on mood (forgiveness logic)."""
    facts = get_facts(npc_id)
    trust = facts.get("trust", [])
    deals = facts.get("deal", [])
    
    situation = []
    
    # Name
    name = facts.get("player_name", [None])[0]
    if name:
        situation.append(f"Customer: {name}")
    
    # Past deals
    if deals:
        situation.append(f"Past deals: {', '.join(deals)}")
    
    # Trust with forgiveness context
    if "was_rude" in trust:
        if mood > 0.8:
            situation.append("They were rude once, but you almost trust them now")
        elif mood > 0.6:
            situation.append("They were rude, but they apologized. Watching.")
        elif mood > 0.4:
            situation.append("They insulted you. Still angry.")
        else:
            situation.append("They insulted you. Want them gone.")
    
    # Paid before?
    if "paid_money" in trust:
        situation.append("They paid before")
    
    return situation

# ==================== PROCEDURAL MEMORY ====================

def update_behavior(npc_id, intent, mood):
    """Learn how to talk to this player based on history."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # If player is often hostile, be defensive
    if intent == "hostile" and mood < 0.3:
        c.execute('''
            INSERT INTO behavior_rules (npc_id, trigger, response_style)
            VALUES (?, ?, ?)
            ON CONFLICT(npc_id, trigger) DO UPDATE SET
                response_style = excluded.response_style
        ''', (npc_id, "hostile_player", "very_short_angry"))
    
    # If player spends money, be greedy but friendly
    if intent == "trade" and mood > 0.6:
        c.execute('''
            INSERT INTO behavior_rules (npc_id, trigger, response_style)
            VALUES (?, ?, ?)
            ON CONFLICT(npc_id, trigger) DO UPDATE SET
                response_style = excluded.response_style
        ''', (npc_id, "good_customer", "friendly_greedy"))
    
    conn.commit()
    conn.close()

def get_behavior_rules(npc_id):
    """Get learned behavior patterns."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT trigger, response_style FROM behavior_rules WHERE npc_id = ?", (npc_id,))
    rows = c.fetchall()
    conn.close()
    return dict(rows)