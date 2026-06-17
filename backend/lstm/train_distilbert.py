import pandas as pd
import torch
from transformers import DistilBertTokenizer, DistilBertForSequenceClassification, Trainer, TrainingArguments
from datasets import Dataset
from sklearn.model_selection import train_test_split
import numpy as np

# Load data
df = pd.read_csv('data.csv')
label_map = {'friendly': 0, 'hostile': 1, 'trade': 2, 'quest': 3}
df['label'] = df['label'].map(label_map)

# Split
train_df, test_df = train_test_split(df, test_size=0.2, random_state=42, stratify=df['label'])

# Convert to HuggingFace Dataset
train_dataset = Dataset.from_pandas(train_df)
test_dataset = Dataset.from_pandas(test_df)

# Tokenizer
tokenizer = DistilBertTokenizer.from_pretrained('distilbert-base-uncased')

def tokenize(batch):
    return tokenizer(batch['text'], padding=True, truncation=True, max_length=64)

train_dataset = train_dataset.map(tokenize, batched=True)
test_dataset = test_dataset.map(tokenize, batched=True)

# Set format for PyTorch
train_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])
test_dataset.set_format(type='torch', columns=['input_ids', 'attention_mask', 'label'])

# Model
model = DistilBertForSequenceClassification.from_pretrained(
    'distilbert-base-uncased',
    num_labels=4
)

# Training args (FIXED: eval_strategy instead of evaluation_strategy)
training_args = TrainingArguments(
    output_dir='./distilbert_results',
    num_train_epochs=5,
    per_device_train_batch_size=8,
    per_device_eval_batch_size=8,
    warmup_steps=10,
    weight_decay=0.01,
    logging_dir='./distilbert_logs',
    logging_steps=10,
    eval_strategy='epoch',           # FIXED
    save_strategy='epoch',
    load_best_model_at_end=True,
)

# Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=test_dataset,
)

# Train
print("Starting fine-tuning...")
trainer.train()

# Evaluate
metrics = trainer.evaluate()
print(f"\nEvaluation metrics: {metrics}")

# Save
model.save_pretrained('distilbert_intent')
tokenizer.save_pretrained('distilbert_intent')
print("Model saved to distilbert_intent/")