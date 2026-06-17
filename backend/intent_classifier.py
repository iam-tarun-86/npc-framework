from transformers import DistilBertTokenizer, DistilBertForSequenceClassification
import torch
import os

MODEL_PATH = "lstm/distilbert_intent"

# Load once at startup
tokenizer = DistilBertTokenizer.from_pretrained(MODEL_PATH)
model = DistilBertForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()

LABELS = {0: 'friendly', 1: 'hostile', 2: 'trade', 3: 'quest'}

def classify_intent(text):
    """Classify player text into intent. Runs on CPU, ~50ms."""
    inputs = tokenizer(text, return_tensors='pt', truncation=True, padding=True, max_length=64)
    
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.softmax(outputs.logits, dim=1)
        predicted = torch.argmax(probs, dim=1).item()
        confidence = probs[0][predicted].item()
    
    return {
        'intent': LABELS[predicted],
        'confidence': round(confidence, 3)
    }