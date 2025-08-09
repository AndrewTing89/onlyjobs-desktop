/**
 * Model downloader for local LLM
 * Downloads model.gguf with progress logging and atomic move
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { DEFAULT_DOWNLOAD_URL, ONLYJOBS_MODEL_PATH } from './config';

async function downloadModel() {
  const modelPath = path.resolve(ONLYJOBS_MODEL_PATH);
  const modelDir = path.dirname(modelPath);
  const tempPath = `${modelPath}.tmp`;
  
  console.log(`📦 Downloading model to: ${modelPath}`);
  console.log(`🔗 URL: ${DEFAULT_DOWNLOAD_URL}`);
  
  // Ensure directory exists
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
    console.log(`📁 Created directory: ${modelDir}`);
  }
  
  // Check if model already exists
  if (fs.existsSync(modelPath)) {
    const stats = fs.statSync(modelPath);
    console.log(`✅ Model already exists (${Math.round(stats.size / 1024 / 1024)}MB)`);
    console.log(`🗂️ Path: ${modelPath}`);
    return;
  }
  
  return new Promise<void>((resolve, reject) => {
    const request = https.get(DEFAULT_DOWNLOAD_URL, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        console.log(`↩️ Following redirect to: ${redirectUrl}`);
        https.get(redirectUrl, handleResponse).on('error', reject);
        return;
      }
      
      handleResponse(response);
    });
    
    function handleResponse(response: any) {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;
      let lastProgressTime = 0;
      
      const writeStream = fs.createWriteStream(tempPath);
      
      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;
        writeStream.write(chunk);
        
        // Progress logging (every 5MB or 5 seconds)
        const now = Date.now();
        if (downloadedSize % (5 * 1024 * 1024) < chunk.length || (now - lastProgressTime) > 5000) {
          const percent = totalSize > 0 ? ((downloadedSize / totalSize) * 100).toFixed(1) : '?';
          const sizeMB = Math.round(downloadedSize / 1024 / 1024);
          const totalMB = totalSize > 0 ? Math.round(totalSize / 1024 / 1024) : '?';
          console.log(`⬇️ Progress: ${percent}% (${sizeMB}/${totalMB} MB)`);
          lastProgressTime = now;
        }
      });
      
      response.on('end', () => {
        writeStream.end();
        
        // Atomic move from temp to final location
        try {
          fs.renameSync(tempPath, modelPath);
          const stats = fs.statSync(modelPath);
          console.log(`✅ Download complete! (${Math.round(stats.size / 1024 / 1024)}MB)`);
          console.log(`🗂️ Model saved to: ${modelPath}`);
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      
      response.on('error', (error: Error) => {
        writeStream.destroy();
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(error);
      });
    }
    
    request.on('error', reject);
    request.setTimeout(300000); // 5 minute timeout
  });
}

// Run if called directly
if (require.main === module) {
  downloadModel()
    .then(() => {
      console.log('🎉 Model download completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Model download failed:', error.message);
      process.exit(1);
    });
}