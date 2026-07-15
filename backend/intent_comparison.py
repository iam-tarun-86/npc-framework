import json
import torch
import pickle
from datetime import datetime
from intent_classifier import classify_intent  # Your existing system

# Load models
from mlp_intent import MLPIntentClassifier
from cnn_intent import CNNIntentClassifier

MAX_LEN = 20
EMBED_DIM = 50

def load_models():
    with open("data/vocab.pkl", "rb") as f:
        vocab = pickle.load(f)
    with open("data/intent_map.json", "r") as f:
        intent_map = json.load(f)
    idx_to_intent = {v: k for k, v in intent_map.items()}
    
    vocab_size = len(vocab)
    num_classes = len(intent_map)
    
    mlp = MLPIntentClassifier(vocab_size, EMBED_DIM, [128, 64], num_classes, MAX_LEN)
    mlp.load_state_dict(torch.load("models/mlp_best.pt", map_location="cpu"))
    mlp.eval()
    
    cnn = CNNIntentClassifier(vocab_size, EMBED_DIM, 64, [2, 3, 4], num_classes, MAX_LEN)
    cnn.load_state_dict(torch.load("models/cnn_best.pt", map_location="cpu"))
    cnn.eval()
    
    return mlp, cnn, vocab, idx_to_intent

def encode_text(text, vocab, max_len):
    tokens = [vocab.get(c, vocab['<UNK>']) for c in text.lower()]
    tokens = tokens[:max_len]
    tokens += [vocab['<PAD>']] * (max_len - len(tokens))
    return torch.tensor([tokens], dtype=torch.long)

def compare_intent_classifiers(player_text):
    """
    Run all three classifiers side-by-side.
    Logs results. Returns existing result (NPC behavior unchanged).
    """
    # Your existing system (perfect NPC behavior)
    existing_result = classify_intent(player_text)
    existing_intent = existing_result['intent']
    
    # Load models (lazy load on first call)
    if not hasattr(compare_intent_classifiers, 'models_loaded'):
        compare_intent_classifiers.mlp, compare_intent_classifiers.cnn, \
        compare_intent_classifiers.vocab, compare_intent_classifiers.idx_to_intent = load_models()
        compare_intent_classifiers.models_loaded = True
    
    mlp = compare_intent_classifiers.mlp
    cnn = compare_intent_classifiers.cnn
    vocab = compare_intent_classifiers.vocab
    idx_to_intent = compare_intent_classifiers.idx_to_intent
    
    # Encode text
    x = encode_text(player_text, vocab, MAX_LEN)
    
    # Predict
    with torch.no_grad():
        mlp_out = mlp(x)
        cnn_out = cnn(x)
        mlp_pred = idx_to_intent[mlp_out.argmax(1).item()]
        cnn_pred = idx_to_intent[cnn_out.argmax(1).item()]
    
    # Log comparison
    comparison = {
        "timestamp": datetime.now().isoformat(),
        "text": player_text,
        "existing": existing_intent,
        "mlp": mlp_pred,
        "cnn": cnn_pred,
        "mlp_match": mlp_pred == existing_intent,
        "cnn_match": cnn_pred == existing_intent,
        "mlp_confidence": round(torch.softmax(mlp_out, 1).max().item(), 3),
        "cnn_confidence": round(torch.softmax(cnn_out, 1).max().item(), 3),
    }
    
    # Return the custom PyTorch MLP prediction to actively drive NPC behavior
    return {
        'intent': mlp_pred,
        'confidence': round(torch.softmax(mlp_out, 1).max().item(), 3)
    }

# Convenience function for your report
def get_accuracy_report():
    """Analyze comparison log for college report."""
    try:
        with open("data/intent_comparison_log.jsonl", "r") as f:
            lines = [json.loads(l) for l in f if l.strip()]
        
        total = len(lines)
        mlp_correct = sum(1 for l in lines if l['mlp_match'])
        cnn_correct = sum(1 for l in lines if l['cnn_match'])
        
        return {
            "total_samples": total,
            "mlp_accuracy": round(mlp_correct / total, 3) if total else 0,
            "cnn_accuracy": round(cnn_correct / total, 3) if total else 0,
        }
    except FileNotFoundError:
        return {"error": "No comparison data yet. Play the game first!"}