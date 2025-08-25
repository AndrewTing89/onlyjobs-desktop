const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');
const https = require('https');
const crypto = require('crypto');
const { createReadStream } = require('fs');

class ModelManager {
  constructor() {
    // Model configurations - optimized for job email classification
    this.models = {
      'qwen2.5-7b': {
        name: 'Qwen2.5-7B-Instruct',
        filename: 'qwen2.5-7b.gguf',
        url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
        size: 4683074240, // Actual size from bartowski repo
        sha256: null, // Will be fetched from HuggingFace or computed
        description: 'Best overall - 32K context, excellent parsing',
        context: 32768
      },
      'llama-3.1-8b': {
        name: 'Llama-3.1-8B-Instruct',
        filename: 'llama-3.1-8b.gguf',
        url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        size: 4920739232, // Actual downloaded size
        sha256: null, // Will be computed or fetched
        description: 'Massive 128K context for few-shot learning',
        context: 131072
      },
      'phi-3.5-mini-128k': {
        name: 'Phi-3.5-mini-128K',
        filename: 'phi-3.5-mini-128k.gguf',
        url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
        size: 2393232672, // Actual downloaded size
        sha256: null, // Will be computed or fetched
        description: 'Small model with huge 128K context window',
        context: 131072
      },
      'hermes-3-llama-8b': {
        name: 'Hermes-3-Llama-3.1-8B',
        filename: 'hermes-3-llama-8b.gguf',
        url: 'https://huggingface.co/NousResearch/Hermes-3-Llama-3.1-8B-GGUF/resolve/main/Hermes-3-Llama-3.1-8B.Q4_K_M.gguf',
        size: 4920733824, // Actual downloaded size
        sha256: null, // Will be computed or fetched
        description: 'Function calling specialist - 128K context',
        context: 131072
      },
      'qwen2.5-3b': {
        name: 'Qwen2.5-3B-Instruct',
        filename: 'qwen2.5-3b.gguf',
        url: 'https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf',
        size: 2104932768, // Actual downloaded size
        sha256: null, // Will be computed or fetched
        description: 'Fast baseline - 32K context',
        context: 32768
      }
    };
    
    // Model directory
    this.modelsDir = path.join(path.dirname(app.getPath('userData')), 'models');
    
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
    if (!model) throw new Error(`Unknown model: ${modelId}`);
    
    const modelPath = this.getModelPath(modelId);
    
    try {
      const stats = await fs.stat(modelPath);
      
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
      
      // Check if file size matches expected (with 10% tolerance)
      const sizeTolerance = 0.10; // 10% tolerance
      const sizeMatch = stats.size === model.size || 
                       (stats.size > model.size * (1 - sizeTolerance) && 
                        stats.size < model.size * (1 + sizeTolerance));
      
      if (sizeMatch) {
        return {
          status: 'ready',
          size: stats.size,
          path: modelPath
        };
      } else {
        const sizeDiff = stats.size - model.size;
        const sizeDiffPercent = ((sizeDiff / model.size) * 100).toFixed(1);
        return {
          status: 'corrupt',
          size: stats.size,
          expectedSize: model.size,
          error: `Size mismatch: ${sizeDiffPercent}% difference (expected ${(model.size / 1e9).toFixed(2)}GB, got ${(stats.size / 1e9).toFixed(2)}GB)`
        };
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { status: 'not_installed' };
      }
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
      
      const handleError = (error) => {
        file.close();
        fs.unlink(tempPath).catch(() => {}); // Clean up temp file
        this.downloads.delete(modelId);
        reject(error);
      };
      
      file.on('error', handleError);
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
}

module.exports = ModelManager;