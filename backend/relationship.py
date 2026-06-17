import sqlite3
import os

DB_PATH = "db.sqlite"

def init_db():
    """Create relationship table if not exists."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS relationships (
            npc_id TEXT PRIMARY KEY,
            mood_score REAL DEFAULT 0.5,
            interaction_count INTEGER DEFAULT 0
        )
    ''')
    conn.commit()
    conn.close()

def get_mood(npc_id):
    """Get current mood score (0.0 = hostile, 1.0 = friendly)."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT mood_score FROM relationships WHERE npc_id = ?", (npc_id,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else 0.5

def update_mood(npc_id, intent_label):
    """Adjust mood based on detected intent."""
    init_db()
    current = get_mood(npc_id)
    
    # Simple mood logic
    adjustments = {
        "friendly": 0.1,
        "hostile": -0.15,
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