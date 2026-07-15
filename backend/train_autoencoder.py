import os
import json
import pickle
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader

from autoencoder import Autoencoder
from train_intent import TRAINING_DATA
from memory.memory import embedder

# ========== CONFIG ==========
EPOCHS = 40
BATCH_SIZE = 32
LR = 0.001
LATENT_DIM = 32
INPUT_DIM = 384  # all-MiniLM-L6-v2 outputs 384-dimensional embeddings

class EmbeddingDataset(Dataset):
    def __init__(self, embeddings):
        self.embeddings = embeddings
        
    def __len__(self):
        return len(self.embeddings)
        
    def __getitem__(self, idx):
        return self.embeddings[idx]

def main():
    os.makedirs("models", exist_ok=True)
    os.makedirs("data", exist_ok=True)
    
    print("1. Extracting sentences from TRAINING_DATA...")
    sentences = [text for text, _ in TRAINING_DATA]
    
    print(f"2. Generating sentence embeddings for {len(sentences)} sentences using SentenceTransformer...")
    # This encodes all 4,000 sentences. ~3-5 seconds on CPU.
    embeddings = embedder.encode(sentences, show_progress_bar=True, convert_to_numpy=True)
    embeddings_tensor = torch.tensor(embeddings, dtype=torch.float32)
    
    # Create DataLoader
    dataset = EmbeddingDataset(embeddings_tensor)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)
    
    # Instantiate Autoencoder
    model = Autoencoder(input_dim=INPUT_DIM, latent_dim=LATENT_DIM)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=LR)
    
    print("\n" + "="*40)
    print("Training Autoencoder (CO4)")
    print("="*40)
    
    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        
        for batch in loader:
            optimizer.zero_grad()
            outputs = model(batch)
            loss = criterion(outputs, batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        avg_loss = total_loss / len(loader)
        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch+1}/{EPOCHS} | Reconstruction Loss (MSE): {avg_loss:.6f}")
            
    # Save the model
    model_path = "models/autoencoder.pt"
    torch.save(model.state_dict(), model_path)
    print(f"\nModel saved successfully to {model_path}")
    
    # 3. Calculate reconstruction loss distribution to determine "surprise" threshold
    model.eval()
    losses = []
    with torch.no_grad():
        for i in range(0, len(embeddings_tensor), BATCH_SIZE):
            batch = embeddings_tensor[i:i+BATCH_SIZE]
            outputs = model(batch)
            # Calculate MSE row-wise
            mse = torch.mean((outputs - batch) ** 2, dim=1)
            losses.extend(mse.tolist())
            
    # Calculate stats
    mean_loss = sum(losses) / len(losses)
    var_loss = sum((x - mean_loss) ** 2 for x in losses) / len(losses)
    std_loss = var_loss ** 0.5
    
    # Define surprise threshold as mean + 3 * standard deviation
    threshold = mean_loss + (3 * std_loss)
    
    config = {
        "input_dim": INPUT_DIM,
        "latent_dim": LATENT_DIM,
        "mean_reconstruction_loss": round(mean_loss, 6),
        "std_reconstruction_loss": round(std_loss, 6),
        "surprise_threshold": round(threshold, 6)
    }
    
    config_path = "data/autoencoder_config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=4)
        
    print(f"Autoencoder configs saved to {config_path}")
    print(f"Surprise Threshold set to: {threshold:.6f} (Mean: {mean_loss:.6f}, Std: {std_loss:.6f})")
    print("="*40)

if __name__ == "__main__":
    main()
