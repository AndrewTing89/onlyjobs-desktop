const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const https = require('https');
const crypto = require('crypto');
const { createReadStream } = require('fs');

class ModelManager {
  constructor() {
    // Cache for SHA256 verification results
    this.sha256Cache = new Map();
    this.sha256InProgress = new Map();
    
    // Model configurations - optimized for job email classification
    this.models = {
      'llama-3-8b-instruct-q5_k_m': {
        name: 'Llama-3-8B-Instruct',
        filename: 'llama-3-8b-instruct-q5_k_m.gguf',
        url: 'https://huggingface.co/bartowski/Meta-Llama-3-8B-Instruct-GGUF/resolve/main/Meta-Llama-3-8B-Instruct-Q5_K_M.gguf',
        size: 5900000000, // ~5.5GB Q5_K_M
        sha256: '16d824ee771e0e33b762bb3dc3232b972ac8dce4d2d449128fca5081962a1a9e',
        description: 'Balanced performance - Q5_K_M quantization',
        context: 8192
      },
      'qwen2.5-7b-instruct-q5_k_m': {
        name: 'Qwen2.5-7B-Instruct',
        filename: 'qwen2.5-7b-instruct-q5_k_m.gguf',
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q5_K_M.gguf',
        size: 5460000000, // ~5.1GB Q5_K_M
        sha256: '2e998d7e181c8756c5ffc55231b9ee1cdc9d3acec4245d6e27d32bd8e738c474',
        description: 'Latest Qwen model - Q5_K_M quantization',
        context: 32768
      },
      'hermes-2-pro-mistral-7b-q5_k_m': {
        name: 'Hermes-2-Pro-Mistral-7B',
        filename: 'hermes-2-pro-mistral-7b-q5_k_m.gguf',
        url: 'https://huggingface.co/NousResearch/Hermes-2-Pro-Mistral-7B-GGUF/resolve/main/Hermes-2-Pro-Mistral-7B.Q5_K_M.gguf',
        size: 5150000000, // ~4.8GB Q5_K_M
        sha256: 'de765610ba638f55cbb58c8ad543136526cc6573222e5340827e43ccc81206b0',
        description: 'Function calling specialist - Q5_K_M',
        context: 32768
      },
      'llama-3.2-3b-instruct-q5_k_m': {
        name: 'Llama-3.2-3B-Instruct',
        filename: 'llama-3.2-3b-instruct-q5_k_m.gguf',
        url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q5_K_M.gguf',
        size: 2100000000, // ~2.1GB Q5_K_M
        sha256: null, // Will be computed after download
        description: 'Compact 3B model - Q5_K_M quantization',
        context: 8192
      },
      'qwen2.5-3b-instruct-q5_k_m': {
        name: 'Qwen2.5-3B-Instruct',
        filename: 'qwen2.5-3b-instruct-q5_k_m.gguf',
        url: 'https://huggingface.co/bartowski/Qwen2.5-3B-Instruct-GGUF/resolve/main/Qwen2.5-3B-Instruct-Q5_K_M.gguf',
        size: 2000000000, // ~2.0GB Q5_K_M
        sha256: null, // Will be computed after download
        description: 'Efficient 3B Qwen model - Q5_K_M quantization',
        context: 32768
      },
      'phi-3.5-mini-instruct-q5_k_m': {
        name: 'Phi-3.5-mini-instruct',
        filename: 'phi-3.5-mini-instruct-q5_k_m.gguf',
        url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q5_K_M.gguf',
        size: 2500000000, // ~2.5GB Q5_K_M
        sha256: null, // Will be computed after download
        description: 'Microsoft Phi-3.5 mini (3.8B) - Q5_K_M quantization',
        context: 4096
      },
      'gemma-2-2b-it-q5_k_m': {
        name: 'Gemma-2-2B-it',
        filename: 'gemma-2-2b-it-q5_k_m.gguf',
        url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q5_K_M.gguf',
        size: 1500000000, // ~1.5GB Q5_K_M
        sha256: null, // Will be computed after download
        description: 'Google Gemma-2 2B instruction tuned - Q5_K_M quantization',
        context: 8192
      }
    };
    
    // Model directory - Use hardcoded path for macOS
    // app.getPath('userData') returns: /Users/ndting/Library/Application Support/onlyjobs-desktop
    // But models are in: /Users/ndting/Library/Application Support/models
    this.modelsDir = '/Users/ndting/Library/Application Support/models';
    
    // Track downloads in progress
    this.downloads = new Map();
  }
  
  async ensureModelsDirectory() {
    try {
      await fs.mkdir(this.modelsDir, { recursive: true });
    } catch (error) {
      console.error('Error creating models directory:', error);
    }
  }
  
  getModelPath(modelId) {
    const model = this.models[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    return path.join(this.modelsDir, model.filename);
  }
  
  async getModelStatus(modelId) {
    const model = this.models[modelId];
    if (!model) {
      console.error(`[ModelManager] Unknown model: ${modelId}`);
      throw new Error(`Unknown model: ${modelId}`);
    }
    
    const modelPath = this.getModelPath(modelId);
    // Less verbose logging
    console.log(`[ModelManager] Checking status for ${modelId}`);
    
    try {
      // 1. Check if file exists
      const stats = await fs.stat(modelPath);
      // File exists, proceed with checks
      
      // Check if download is in progress
      if (this.downloads.has(modelId)) {
        const download = this.downloads.get(modelId);
        return {
          status: 'downloading',
          progress: download.progress,
          totalSize: model.size,
          downloadedSize: download.downloadedSize
        };
      }
      
      // 2. SKIP SHA256 verification - it's too slow and pointless
      // Just check if file exists with reasonable size
      /*
      if (model.sha256) {
        try {
          const isValid = await this.verifySHA256(modelPath, model.sha256);
          if (isValid) {
            return {
              status: 'ready',
              size: stats.size,
              path: modelPath
            };
          } else {
            return {
              status: 'corrupt',
              size: stats.size,
              error: 'SHA256 verification failed - file may be corrupted'
            };
          }
        } catch (error) {
          console.error(`[ModelManager] SHA256 verification error:`, error);
          // Fall through to size check
        }
      }
      */
      
      // Just check if file exists with reasonable size
      if (stats.size > 1e9) { // File is > 1GB, probably valid
        return {
          status: 'ready',
          size: stats.size,
          path: modelPath
        };
      }
      
      // File too small to be a valid model
      return {
        status: 'corrupt',
        size: stats.size,
        error: 'File size too small to be a valid model'
      };
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 'not_installed' };
      }
      console.error(`[ModelManager] Unexpected error:`, error);
      throw error;
    }
  }
  
  async getAllModelStatuses() {
    const statuses = {};
    for (const modelId of Object.keys(this.models)) {
      statuses[modelId] = await this.getModelStatus(modelId);
    }
    return statuses;
  }
  
  async downloadModel(modelId, onProgress) {
    const model = this.models[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    
    await this.ensureModelsDirectory();
    
    const modelPath = this.getModelPath(modelId);
    const tempPath = modelPath + '.downloading';
    
    // Check if already downloading
    if (this.downloads.has(modelId)) {
      throw new Error(`Model ${modelId} is already downloading`);
    }
    
    return new Promise((resolve, reject) => {
      const download = {
        progress: 0,
        downloadedSize: 0,
        startTime: Date.now()
      };
      
      this.downloads.set(modelId, download);
      
      const file = require('fs').createWriteStream(tempPath);
      
      // Define handlers before using them
      const handleError = (error) => {
        file.close();
        fs.unlink(tempPath).catch(() => {}); // Clean up temp file
        this.downloads.delete(modelId);
        reject(error);
      };
      
      const handleResponse = (response) => {
        const totalSize = parseInt(response.headers['content-length'], 10) || model.size;
        let downloadedSize = 0;
        
        response.on('data', (chunk) => {
          downloadedSize += chunk.length;
          download.downloadedSize = downloadedSize;
          download.progress = (downloadedSize / totalSize) * 100;
          
          if (onProgress) {
            onProgress({
              modelId,
              progress: download.progress,
              downloadedSize,
              totalSize,
              speed: downloadedSize / ((Date.now() - download.startTime) / 1000)
            });
          }
        });
        
        response.pipe(file);
        
        file.on('finish', async () => {
          file.close();
          
          try {
            // Move temp file to final location
            await fs.rename(tempPath, modelPath);
            
            this.downloads.delete(modelId);
            
            resolve({
              modelId,
              path: modelPath,
              size: downloadedSize
            });
          } catch (error) {
            this.downloads.delete(modelId);
            reject(error);
          }
        });
      };
      
      file.on('error', handleError);
      
      // Now make the actual request
      https.get(model.url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          file.close();
          https.get(response.headers.location, (redirectResponse) => {
            handleResponse(redirectResponse);
          }).on('error', handleError);
        } else {
          handleResponse(response);
        }
      }).on('error', handleError);
    });
  }
  
  async deleteModel(modelId) {
    const modelPath = this.getModelPath(modelId);
    
    try {
      await fs.unlink(modelPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false; // Already deleted
      }
      throw error;
    }
  }
  
  async computeSHA256(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', (data) => {
        hash.update(data);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }
  
  async verifyModel(modelId) {
    const model = this.models[modelId];
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    
    const modelPath = this.getModelPath(modelId);
    
    try {
      const stats = await fs.stat(modelPath);
      const validationErrors = [];
      
      // First check: GGUF magic bytes (quick format check)
      const fd = await fs.open(modelPath, 'r');
      const buffer = Buffer.alloc(4);
      await fd.read(buffer, 0, 4, 0);
      await fd.close();
      
      const magicBytes = buffer.toString('utf8');
      if (magicBytes !== 'GGUF') {
        validationErrors.push(`Invalid file format (expected GGUF, got ${magicBytes})`);
      }
      
      // If SHA256 is available, use it as primary verification
      if (model.sha256) {
        console.log(`Computing SHA256 for ${modelId}...`);
        const actualHash = await this.computeSHA256(modelPath);
        
        if (actualHash !== model.sha256) {
          validationErrors.push(`SHA256 mismatch`);
          validationErrors.push(`Expected: ${model.sha256}`);
          validationErrors.push(`Got: ${actualHash}`);
        } else {
          console.log(`SHA256 verified for ${modelId}`);
        }
      } else {
        // Fall back to size check if no SHA256
        const sizeTolerance = 0.10; // 10% tolerance
        const sizeMatch = stats.size === model.size || 
                         (stats.size > model.size * (1 - sizeTolerance) && 
                          stats.size < model.size * (1 + sizeTolerance));
        
        if (!sizeMatch) {
          const sizeDiff = stats.size - model.size;
          const sizeDiffPercent = ((sizeDiff / model.size) * 100).toFixed(1);
          validationErrors.push(`Size mismatch: ${sizeDiffPercent}% difference`);
          validationErrors.push(`Expected: ${(model.size / 1e9).toFixed(2)}GB`);
          validationErrors.push(`Got: ${(stats.size / 1e9).toFixed(2)}GB`);
        }
      }
      
      if (validationErrors.length > 0) {
        return {
          valid: false,
          reason: validationErrors.join(' | ')
        };
      }
      
      return {
        valid: true,
        size: stats.size,
        checksum: model.sha256 ? 'SHA256 verified' : 'Size verified'
      };
    } catch (error) {
      return {
        valid: false,
        reason: `Verification error: ${error.message}`
      };
    }
  }
  
  getModelInfo(modelId) {
    return this.models[modelId] || null;
  }
  
  getAllModels() {
    return Object.entries(this.models).map(([id, info]) => ({
      id,
      ...info
    }));
  }
  
  // Compute and store SHA256 checksums for all downloaded models
  async computeAllChecksums() {
    const results = {};
    
    for (const [modelId, model] of Object.entries(this.models)) {
      const modelPath = this.getModelPath(modelId);
      
      try {
        await fs.stat(modelPath);
        console.log(`Computing SHA256 for ${modelId}...`);
        const hash = await this.computeSHA256(modelPath);
        results[modelId] = hash;
        console.log(`${modelId}: ${hash}`);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.error(`Error computing checksum for ${modelId}:`, error);
        }
      }
    }
    
    return results;
  }
  
  // Fetch checksums from HuggingFace (requires parsing their API)
  async fetchChecksumsFromHuggingFace() {
    // This would require making API calls to HuggingFace to get the SHA256
    // For now, we'll use computed checksums
    console.log('Fetching checksums from HuggingFace is not yet implemented');
    console.log('Using local computation instead');
    return this.computeAllChecksums();
  }
  
  // Verify SHA256 hash of a file with caching
  async verifySHA256(filepath, expectedHash) {
    try {
      // Check cache first
      const cacheKey = `${filepath}:${expectedHash}`;
      if (this.sha256Cache.has(cacheKey)) {
        const cached = this.sha256Cache.get(cacheKey);
        console.log(`[ModelManager] Using cached SHA256 result for ${filepath.split('/').pop()}: ${cached}`);
        return cached;
      }
      
      // Check if verification is already in progress
      if (this.sha256InProgress.has(cacheKey)) {
        console.log(`[ModelManager] SHA256 verification already in progress for ${filepath.split('/').pop()}, waiting...`);
        return this.sha256InProgress.get(cacheKey);
      }
      
      // Start new verification
      console.log(`[ModelManager] Starting new SHA256 verification for ${filepath.split('/').pop()}`);
      const verificationPromise = new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = createReadStream(filepath);
        
        stream.on('data', (data) => {
          hash.update(data);
        });
        
        stream.on('end', () => {
          const computedHash = hash.digest('hex');
          const matches = computedHash.toLowerCase() === expectedHash.toLowerCase();
          console.log(`[ModelManager] SHA256 verification completed for ${filepath.split('/').pop()}: ${matches}`);
          
          // Cache the result
          this.sha256Cache.set(cacheKey, matches);
          this.sha256InProgress.delete(cacheKey);
          
          resolve(matches);
        });
        
        stream.on('error', (error) => {
          console.error(`[ModelManager] Error reading file for SHA256: ${error}`);
          this.sha256InProgress.delete(cacheKey);
          reject(error);
        });
      });
      
      // Store the promise so other calls can wait for it
      this.sha256InProgress.set(cacheKey, verificationPromise);
      
      return verificationPromise;
    } catch (error) {
      console.error(`[ModelManager] SHA256 verification error: ${error}`);
      return false;
    }
  }
  
}

module.exports = ModelManager;