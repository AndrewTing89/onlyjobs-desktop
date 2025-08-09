const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

async function main() {
  console.log('🔍 Native Module Diagnostic for Electron');
  console.log('=====================================');
  
  // Platform and architecture info
  console.log(`📱 Platform: ${process.platform}`);
  console.log(`🏗️ Architecture: ${process.arch}`);
  
  // Process versions
  console.log('\n📊 Process Versions:');
  console.log(`  Electron: ${process.versions.electron}`);
  console.log(`  Node: ${process.versions.node}`);
  console.log(`  Modules (ABI): ${process.versions.modules}`);
  console.log(`  Chrome: ${process.versions.chrome}`);
  console.log(`  V8: ${process.versions.v8}`);
  
  // Get electron version via spawn
  try {
    const electronVersion = await new Promise((resolve, reject) => {
      const child = spawn('npx', ['electron', '--version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = '';
      let stderr = '';
      
      child.stdout.on('data', (data) => stdout += data);
      child.stderr.on('data', (data) => stderr += data);
      
      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Electron version check failed: ${stderr}`));
        }
      });
    });
    console.log(`  Electron (via npx): ${electronVersion}`);
  } catch (error) {
    console.log(`  Electron (via npx): FAILED - ${error.message}`);
  }
  
  // Resolve node-llama-cpp path
  try {
    const llamaModulePath = require.resolve('node-llama-cpp');
    console.log(`\n📦 node-llama-cpp resolved path:`);
    console.log(`  ${llamaModulePath}`);
  } catch (error) {
    console.log(`\n❌ Failed to resolve node-llama-cpp: ${error.message}`);
    return;
  }
  
  // List build directory contents
  const llamaPackagePath = path.dirname(require.resolve('node-llama-cpp'));
  const buildPath = path.join(llamaPackagePath, '..', 'build', 'Release');
  console.log(`\n🏗️ Build directory contents:`);
  console.log(`  Path: ${buildPath}`);
  
  try {
    if (fs.existsSync(buildPath)) {
      const files = fs.readdirSync(buildPath);
      if (files.length > 0) {
        files.forEach(file => {
          const filePath = path.join(buildPath, file);
          const stats = fs.statSync(filePath);
          console.log(`    ${file} (${Math.round(stats.size / 1024)}KB)`);
        });
      } else {
        console.log('    (empty directory)');
      }
    } else {
      console.log('    (directory does not exist)');
    }
  } catch (error) {
    console.log(`    ERROR reading build directory: ${error.message}`);
  }
  
  // Try loading the module
  console.log(`\n🧪 Loading node-llama-cpp module:`);
  try {
    const mod = await import('node-llama-cpp');
    console.log(`  Module type: ${typeof mod}`);
    console.log(`  Top-level keys: ${mod ? Object.keys(mod).join(', ') : 'none'}`);
    
    if (mod && mod.LlamaModel) {
      console.log(`  LlamaModel available: ${typeof mod.LlamaModel}`);
    } else {
      console.log(`  ❌ LlamaModel not found`);
    }
    
    if (mod && mod.LlamaContext) {
      console.log(`  LlamaContext available: ${typeof mod.LlamaContext}`);
    } else {
      console.log(`  ❌ LlamaContext not found`);
    }
    
    // Try to peek at internal structure
    if (mod && typeof mod === 'object') {
      console.log(`  Module properties count: ${Object.keys(mod).length}`);
      const sampleKeys = Object.keys(mod).slice(0, 10);
      console.log(`  Sample keys (first 10): ${sampleKeys.join(', ')}`);
    }
    
  } catch (error) {
    console.log(`  ❌ Failed to import: ${error.name}: ${error.message}`);
    if (error.stack) {
      console.log(`  Stack trace:`);
      error.stack.split('\n').slice(0, 10).forEach(line => {
        console.log(`    ${line}`);
      });
    }
  }
  
  console.log(`\n✅ Diagnostic complete`);
  process.exit(0);
}

main().catch(error => {
  console.error('Diagnostic script error:', error);
  process.exit(0); // Still exit 0 for diagnostic purposes
});