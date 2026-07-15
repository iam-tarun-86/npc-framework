import chromadb
from sentence_transformers import SentenceTransformer
import uuid
from datetime import datetime

# Load embedding model once (CPU, ~100MB)
embedder = SentenceTransformer('all-MiniLM-L6-v2')

# ChromaDB client with persistent storage
chroma_client = chromadb.PersistentClient(path="memory/chroma_store")

def get_npc_collection(npc_id):
    """Get or create a collection for this NPC."""
    return chroma_client.get_or_create_collection(name=f"npc_{npc_id}")

def add_memory(npc_id, text, metadata=None):
    """Store a conversation turn in vector memory."""
    collection = get_npc_collection(npc_id)
    embedding = embedder.encode(text).tolist()
    
    memory_id = str(uuid.uuid4())
    collection.add(
        ids=[memory_id],
        embeddings=[embedding],
        documents=[text],
        metadatas=[metadata or {"timestamp": datetime.now().isoformat()}]
    )
    return memory_id

def get_relevant_memories(npc_id, query_text, n_results=3):
    """Retrieve top-N most relevant memories (this IS attention)."""
    collection = get_npc_collection(npc_id)
    query_embedding = embedder.encode(query_text).tolist()
    
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n_results
    )
    return results["documents"][0] if results["documents"] else []

def get_all_memories(npc_id):
    """Retrieve ALL memories for an NPC (for chat history)."""
    try:
        collection = get_npc_collection(npc_id)
        results = collection.get()
        if results and results['documents']:
            # Return list of {text, timestamp, is_core, salience} objects
            memories = []
            for i, doc in enumerate(results['documents']):
                meta = results['metadatas'][i] if results['metadatas'] else {}
                memories.append({
                    'text': doc,
                    'timestamp': meta.get('timestamp', 'unknown'),
                    'is_core': meta.get('is_core', False),
                    'salience': meta.get('salience', 0.0)
                })
            return memories
        return []
    except Exception as e:
        print(f"Error getting memories: {e}")
        return []

def clear_memories(npc_id):
    """Delete all memories for an NPC."""
    try:
        collection = chroma_client.get_or_create_collection(name=f"npc_{npc_id}")
        results = collection.get()
        if results and results['ids']:
            collection.delete(ids=results['ids'])
        return True
    except Exception as e:
        print(f"Error clearing memories: {e}")
        return False
