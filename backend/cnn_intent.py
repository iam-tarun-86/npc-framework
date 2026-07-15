import torch
import torch.nn as nn
import torch.nn.functional as F

class CNNIntentClassifier(nn.Module):
    """
    Character-level CNN for NPC intent classification.
    Syllabus: CO1 (CNN), CO3 (architecture analysis)
    """
    def __init__(self, vocab_size, embed_dim=50, num_filters=64, filter_sizes=[2, 3, 4], num_classes=4, max_len=20):
        super().__init__()
        self.max_len = max_len
        self.embedding = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
        
        self.convs = nn.ModuleList([
            nn.Conv1d(embed_dim, num_filters, k) for k in filter_sizes
        ])
        self.dropout = nn.Dropout(0.5)
        self.fc = nn.Linear(len(filter_sizes) * num_filters, num_classes)
        
    def forward(self, x):
        embedded = self.embedding(x)  # (batch, max_len, embed_dim)
        embedded = embedded.permute(0, 2, 1)  # (batch, embed_dim, max_len)
        
        conv_outputs = []
        for conv in self.convs:
            conv_out = F.relu(conv(embedded))
            pooled = F.max_pool1d(conv_out, conv_out.size(2)).squeeze(2)
            conv_outputs.append(pooled)
        
        combined = torch.cat(conv_outputs, dim=1)
        dropped = self.dropout(combined)
        return self.fc(dropped)