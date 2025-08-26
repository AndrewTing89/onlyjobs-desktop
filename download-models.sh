#!/bin/bash

# Create models directory
MODELS_DIR="/Users/ndting/Library/Application Support/models"
mkdir -p "$MODELS_DIR"

echo "Downloading 3 models for testing..."

# 1. Llama-3-8B-Instruct Q5_K_M (5.5GB)
echo "Downloading Llama-3-8B-Instruct Q5_K_M..."
curl -L -C - -o "$MODELS_DIR/llama-3-8b-instruct-q5_k_m.gguf" \
  "https://huggingface.co/bartowski/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct-Q5_K_M.gguf"

# 2. Qwen2.5-7B-Instruct Q5_K_M (5.1GB)
echo "Downloading Qwen2.5-7B-Instruct Q5_K_M..."
curl -L -C - -o "$MODELS_DIR/qwen2.5-7b-instruct-q5_k_m.gguf" \
  "https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q5_K_M.gguf"

# 3. Hermes-2-Pro-Mistral-7B Q5_K_M (4.8GB)
echo "Downloading Hermes-2-Pro-Mistral-7B Q5_K_M..."
curl -L -C - -o "$MODELS_DIR/hermes-2-pro-mistral-7b-q5_k_m.gguf" \
  "https://huggingface.co/NousResearch/Hermes-2-Pro-Mistral-7B-GGUF/resolve/main/Hermes-2-Pro-Mistral-7B.Q5_K_M.gguf"

echo "All models downloaded to $MODELS_DIR"
ls -lh "$MODELS_DIR"/*.gguf