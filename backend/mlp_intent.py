import torch
import torch.nn as nn
import torch.nn.functional as F

class MLPIntentClassifier(nn.Module):
    """
    Multi-Layer Perceptron for NPC intent classification.
    Syllabus: CO1 (MLP), CO3 (architecture analysis)
    """
    def __init__(self, vocab_size, embed_dim=50, hidden_dims=[128, 64], num_classes=4, max_len=20):
        super().__init__()
        self.max_len = max_len
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        
        layers = []
        prev_dim = embed_dim * max_len  # Flatten after embedding
        for h in hidden_dims:
            layers.extend([
                nn.Linear(prev_dim, h),
                nn.ReLU(),
                nn.Dropout(0.3)
            ])
            prev_dim = h
        
        self.hidden = nn.Sequential(*layers)
        self.output = nn.Linear(prev_dim, num_classes)
        
    def forward(self, x):
        # x: (batch, max_len)
        embedded = self.embedding(x)  # (batch, max_len, embed_dim)
        embedded = embedded.view(embedded.size(0), -1)  # Flatten
        hidden = self.hidden(embedded)
        return self.output(hidden)