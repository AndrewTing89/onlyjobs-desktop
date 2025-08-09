const fs = require('fs');
const path = require('path');

const MODEL_PATH = process.env.ONLYJOBS_MODEL_PATH || path.resolve(process.cwd(), 'models', 'model.gguf');
const TEMP = Number(process.env.ONLYJOBS_TEMPERATURE || 0.1);
const MAX_TOKENS = Number(process.env.ONLYJOBS_MAX_TOKENS || 256);
const CTX = Number(process.env.ONLYJOBS_CTX || 2048);
const GPU_LAYERS = Number(process.env.ONLYJOBS_N_GPU_LAYERS || 0);

async function main() {
  console.log('🧪 Electron LLM JS test starting…');
  console.log('🔧 Model path:', MODEL_PATH);
  if (!fs.existsSync(MODEL_PATH)) {
    console.error('❌ Model missing at', MODEL_PATH);
    process.exit(1);
  }
  try {
    const llamaModule = await import('node-llama-cpp');
    
    // Get getLlama function (handle different export patterns)
    const getLlama = llamaModule.getLlama || (llamaModule.default && llamaModule.default.getLlama);
    if (!getLlama) {
      throw new Error('node-llama-cpp getLlama() not available');
    }

    console.log('🔧 Initializing llama.cpp...');
    const llamaInstance = await getLlama();
    
    console.log('🔧 Loading model...');
    const model = await llamaInstance.loadModel({
      modelPath: MODEL_PATH,
      gpuLayers: GPU_LAYERS
    });
    
    console.log('🧮 Creating context...');
    const context = await model.createContext({
      contextSize: CTX
    });
    
    console.log('💬 Creating session...');
    const session = new llamaModule.LlamaChatSession({
      contextSequence: context.getSequence()
    });

    const subject = "Application received – Software Engineer";
    const plaintext = "Thanks for applying to TechCorp. We received your application for Software Engineer.";

    const system = "You are an email classifier for job applications. Output ONLY strict JSON with keys: is_job_related (boolean), company (string|null), position (string|null), status (Applied|Interview|Declined|Offer|null). No extra text.";
    const user = `Subject: ${subject}\n\nPlaintext:\n${plaintext}\n\nReturn JSON only.`;
    
    console.log('🧠 Querying model...');
    const reply = await session.prompt([ 
      { role: 'system', content: system }, 
      { role: 'user', content: user } 
    ], {
      temperature: TEMP,
      maxTokens: MAX_TOKENS
    });

    console.log('📝 Raw model response:', reply);
    
    // Try to extract JSON
    const m = reply.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('Model did not return JSON');
    const obj = JSON.parse(m[0]);
    console.log('✅ JSON:', JSON.stringify(obj));
    process.exit(0);
  } catch (err) {
    console.error('❌ LLM init/test failed:', err && err.stack || err);
    console.error('ℹ️ If you rebuilt for Electron, always run tests under ELECTRON_RUN_AS_NODE=1 using the Electron binary.');
    console.error('ℹ️ Try: npm run rebuild:llm');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });