const API_URL = "http://localhost:5000";

export async function sendMessage(npc_id, player_text) {
  const res = await fetch(`${API_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ npc_id, player_text }),
  });
  return res.json();
}

export async function getMemories(npc_id) {
  const res = await fetch(`${API_URL}/memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ npc_id }),
  });
  return res.json();
}

export async function getAllMemories() {
  const res = await fetch(`${API_URL}/all-memories`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  return res.json();
}

export async function clearMemory(npc_id) {
  const res = await fetch(`${API_URL}/clear-memory`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ npc_id }),
  });
  return res.json();
}

export async function clearAllMemories() {
  const res = await fetch(`${API_URL}/clear-all-memories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: true }),
  });
  return res.json();
}
