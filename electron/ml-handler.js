const { PythonShell } = require('python-shell');
const path = require('path');
const fs = require('fs').promises;
const { app } = require('electron');

class MLHandler {
  constructor() {
    this.isInitialized = false;
    this.pythonPath = null;
    this.modelPath = null;
    this.classifierScriptPath = null;
    this.initializePromise = null;
  }

  /**
   * Initialize the ML handler by detecting Python and checking for models
   */
  async initialize() {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this._doInitialize();
    return this.initializePromise;
  }

  async _doInitialize() {
    if (this.isInitialized) return true;

    try {
      console.log('🤖 Initializing ML Handler...');

      // Detect Python installation
      await this._detectPython();

      // Set up paths
      this._setupPaths();

      // Check for trained models
      await this._checkModels();

      // Install Python dependencies if needed
      await this._ensureDependencies();

      this.isInitialized = true;
      console.log('✅ ML Handler initialized successfully');
      return true;

    } catch (error) {
      console.error('❌ Failed to initialize ML Handler:', error);
      throw error;
    }
  }

  /**
   * Detect Python installation and version
   */
  async _detectPython() {
    const pythonCommands = ['python3', 'python', 'py'];
    
    for (const cmd of pythonCommands) {
      try {
        const result = await this._runPythonCommand(cmd, ['-c', 'import sys; print(sys.version_info[:2])']);
        
        if (result && result.length > 0) {
          // Parse version from output like "(3, 8)" or "(3, 9)"
          const versionMatch = result[0].match(/\((\d+),\s*(\d+)\)/);
          if (versionMatch) {
            const major = parseInt(versionMatch[1]);
            const minor = parseInt(versionMatch[2]);
            
            if (major === 3 && minor >= 8) {
              this.pythonPath = cmd;
              console.log(`✅ Found Python ${major}.${minor} at: ${cmd}`);
              return;
            }
          }
        }
      } catch (error) {
        // Try next command
        continue;
      }
    }

    throw new Error('Python 3.8+ not found. Please install Python 3.8 or higher.');
  }

  /**
   * Set up file paths for ML components
   */
  _setupPaths() {
    const appPath = app.isPackaged ? 
      path.join(process.resourcesPath, 'ml-classifier') : 
      path.join(__dirname, '..', 'ml-classifier');

    this.classifierScriptPath = path.join(appPath, 'scripts', 'classify_email_simple.py');
    this.modelPath = path.join(appPath, 'data', 'models', 'best_model.pkl');
    this.featureExtractorPath = path.join(appPath, 'data', 'models', 'feature_extractors.pkl');
    this.mlClassifierRoot = appPath;

    console.log('📁 ML Classifier paths:');
    console.log('  Root:', this.mlClassifierRoot);
    console.log('  Script:', this.classifierScriptPath);
    console.log('  Model:', this.modelPath);
  }

  /**
   * Check if trained models exist
   */
  async _checkModels() {
    try {
      await fs.access(this.modelPath);
      await fs.access(this.featureExtractorPath);
      console.log('✅ Pre-trained models found');
    } catch (error) {
      console.warn('⚠️  Pre-trained models not found. You may need to train the model first.');
      console.log('Run: python scripts/train_models.py in the ml-classifier directory');
    }
  }

  /**
   * Ensure Python dependencies are installed
   */
  async _ensureDependencies() {
    try {
      // Check if required packages are available
      const checkScript = `
import sys
required_packages = [
    'sklearn', 'numpy', 'pandas', 'scipy', 'joblib', 'yaml'
]

missing = []
for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        missing.append(package)

if missing:
    print(f"MISSING: {','.join(missing)}")
    sys.exit(1)
else:
    print("ALL_DEPENDENCIES_OK")
`;

      const result = await this._runPythonCommand(this.pythonPath, ['-c', checkScript]);
      
      if (result && result.some(line => line.includes('MISSING'))) {
        console.warn('⚠️  Some Python dependencies are missing.');
        console.log('Installing dependencies...');
        
        const requirementsPath = path.join(this.mlClassifierRoot, 'requirements.txt');
        await this._runPythonCommand(this.pythonPath, ['-m', 'pip', 'install', '-r', requirementsPath]);
        
        console.log('✅ Dependencies installed successfully');
      } else {
        console.log('✅ All Python dependencies are available');
      }
    } catch (error) {
      console.warn('⚠️  Could not verify Python dependencies:', error.message);
      // Continue anyway - the classification might still work
    }
  }

  /**
   * Run a Python command and return output
   */
  _runPythonCommand(pythonCmd, args, options = {}) {
    return new Promise((resolve, reject) => {
      // For simple version checks and imports, use runString
      if (args.length === 2 && args[0] === '-c') {
        const pythonOptions = {
          mode: 'text',
          pythonPath: pythonCmd,
          ...options
        };

        PythonShell.runString(args[1], pythonOptions, (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        });
      } else {
        // For other commands like pip install, use spawn directly
        const { spawn } = require('child_process');
        
        const process = spawn(pythonCmd, args);
        let stdout = '';
        let stderr = '';

        process.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', (code) => {
          if (code === 0) {
            resolve(stdout.split('\n').filter(line => line.trim()));
          } else {
            reject(new Error(stderr || `Process exited with code ${code}`));
          }
        });

        process.on('error', (error) => {
          reject(error);
        });
      }
    });
  }

  /**
   * Classify an email using the ML model
   */
  async classifyEmail(emailContent) {
    try {
      await this.initialize();

      if (!this.pythonPath) {
        throw new Error('Python not available');
      }

      // Check if models exist
      try {
        await fs.access(this.modelPath);
        await fs.access(this.featureExtractorPath);
      } catch (error) {
        throw new Error('ML models not found. Please train the model first by running: python scripts/train_models.py');
      }

      console.log('🔍 Classifying email with ML model...');

      const options = {
        mode: 'text',
        pythonPath: this.pythonPath,
        scriptPath: path.dirname(this.classifierScriptPath),
        args: [
          '--text', emailContent,
          '--format', 'json'
        ]
      };

      const results = await new Promise((resolve, reject) => {
        PythonShell.run(path.basename(this.classifierScriptPath), options, (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        });
      });

      // Parse the JSON result
      if (results && results.length > 0) {
        try {
          const jsonResult = JSON.parse(results.join('\n'));
          
          // Enhance the result with additional metadata
          const enhancedResult = {
            ...jsonResult,
            model_version: '1.0',
            processed_at: new Date().toISOString(),
            processing_time_ms: Date.now() - Date.now() // This would be calculated properly in production
          };

          console.log('✅ Email classification completed:', {
            is_job_related: enhancedResult.is_job_related,
            confidence: enhancedResult.confidence
          });

          return enhancedResult;
        } catch (parseError) {
          console.error('❌ Failed to parse ML model result:', parseError);
          throw new Error('Invalid response from ML model');
        }
      } else {
        throw new Error('No result from ML model');
      }

    } catch (error) {
      console.error('❌ Email classification failed:', error);
      
      // Return fallback classification
      return this._getFallbackClassification(emailContent, error.message);
    }
  }

  /**
   * Provide fallback classification when ML model fails
   */
  _getFallbackClassification(emailContent, errorMessage) {
    console.log('🔄 Using fallback classification...');
    
    const content = emailContent.toLowerCase();
    
    // Simple keyword-based fallback
    const jobKeywords = [
      'interview', 'position', 'application', 'job', 'offer', 'salary',
      'career', 'opportunity', 'hiring', 'recruitment', 'candidate',
      'resume', 'cv', 'applied', 'recruiter', 'hr', 'human resources'
    ];

    const nonJobKeywords = [
      'payment', 'invoice', 'receipt', 'order', 'shipping', 'delivery',
      'newsletter', 'promotion', 'sale', 'discount', 'social', 'notification'
    ];

    let jobScore = 0;
    let nonJobScore = 0;

    jobKeywords.forEach(keyword => {
      if (content.includes(keyword)) jobScore++;
    });

    nonJobKeywords.forEach(keyword => {
      if (content.includes(keyword)) nonJobScore++;
    });

    const isJobRelated = jobScore > nonJobScore;
    const confidence = Math.max(jobScore, nonJobScore) > 0 ? 
      Math.min(0.8, 0.5 + (Math.abs(jobScore - nonJobScore) * 0.1)) : 0.5;

    return {
      is_job_related: isJobRelated,
      confidence: confidence,
      probabilities: {
        non_job_related: isJobRelated ? 1 - confidence : confidence,
        job_related: isJobRelated ? confidence : 1 - confidence
      },
      model_version: 'fallback-1.0',
      processed_at: new Date().toISOString(),
      fallback_reason: errorMessage,
      fallback_scores: { jobScore, nonJobScore }
    };
  }

  /**
   * Check if ML model is available and ready
   */
  async isModelReady() {
    try {
      await this.initialize();
      
      if (!this.pythonPath) return false;
      
      await fs.access(this.modelPath);
      await fs.access(this.featureExtractorPath);
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get ML model status and information
   */
  async getModelStatus() {
    try {
      await this.initialize();

      const status = {
        python_available: !!this.pythonPath,
        python_path: this.pythonPath,
        model_ready: false,
        model_path: this.modelPath,
        feature_extractor_ready: false,
        initialized: this.isInitialized
      };

      try {
        await fs.access(this.modelPath);
        status.model_ready = true;
      } catch (error) {
        // Model not found
      }

      try {
        await fs.access(this.featureExtractorPath);
        status.feature_extractor_ready = true;
      } catch (error) {
        // Feature extractor not found
      }

      return status;
    } catch (error) {
      return {
        python_available: false,
        error: error.message,
        initialized: false
      };
    }
  }

  /**
   * Train the ML model (if training script is available)
   */
  async trainModel(options = {}) {
    try {
      await this.initialize();

      if (!this.pythonPath) {
        throw new Error('Python not available');
      }

      const trainScriptPath = path.join(this.mlClassifierRoot, 'scripts', 'train_models.py');
      
      try {
        await fs.access(trainScriptPath);
      } catch (error) {
        throw new Error('Training script not found');
      }

      console.log('🏋️  Starting ML model training...');

      const pythonOptions = {
        mode: 'text',
        pythonPath: this.pythonPath,
        scriptPath: path.dirname(trainScriptPath),
        args: options.algorithm ? ['--algorithm', options.algorithm] : []
      };

      const results = await new Promise((resolve, reject) => {
        PythonShell.run(path.basename(trainScriptPath), pythonOptions, (err, results) => {
          if (err) {
            reject(err);
          } else {
            resolve(results);
          }
        });
      });

      console.log('✅ Model training completed');
      return {
        success: true,
        output: results
      };

    } catch (error) {
      console.error('❌ Model training failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
const mlHandler = new MLHandler();
module.exports = mlHandler;