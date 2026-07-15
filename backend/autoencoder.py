import torch
import torch.nn as nn

class Autoencoder(nn.Module):
    """
    Autoencoder for dimensionality reduction and reconstruction of sentence embeddings.
    Syllabus: CO4 (Autoencoders), CO5 (Cognitive Surprise Application)
    """
    def __init__(self, input_dim=384, latent_dim=32):
        super().__init__()
        
        # Encoder: 384 -> 128 -> 32
        self.encoder = nn.Sequential(
            nn.Linear(input_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, latent_dim)
        )
        
        # Decoder: 32 -> 128 -> 384
        self.decoder = nn.Sequential(
            nn.Linear(latent_dim, 128),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(128, input_dim)
        )
        
    def forward(self, x):
        latent = self.encoder(x)
        reconstructed = self.decoder(latent)
        return reconstructed
