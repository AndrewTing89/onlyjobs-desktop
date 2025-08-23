const { ipcMain } = require('electron');

// Create a mock ipcMain to test the circuit breaker status directly
const mockIPC = {
  handlers: {},
  handle: (channel, handler) => {
    mockIPC.handlers[channel] = handler;
  },
  getHandler: (channel) => mockIPC.handlers[channel]
};

// Replace ipcMain with our mock for testing
global.ipcMain = mockIPC;

// Import the handlers to register them
require('./electron/ipc-handlers.js');

async function checkCircuitBreakerStatus() {
  console.log('🔍 Checking circuit breaker status...\n');
  
  try {
    const statusHandler = mockIPC.getHandler('ml:get-circuit-breaker-status');
    if (!statusHandler) {
      console.log('❌ Circuit breaker status handler not found');
      return;
    }
    
    const status = await statusHandler();
    console.log('📊 Circuit Breaker Status:');
    console.log(`   Success: ${status.success}`);
    console.log(`   Active: ${status.is_active}`);
    console.log(`   Failures: ${status.consecutive_failures}`);
    console.log(`   Max Failures: ${status.max_failures}`);
    console.log(`   Blocked Until: ${status.blocked_until}`);
    console.log(`   Blocked For: ${status.blocked_for_ms}ms`);
    
    if (status.is_active) {
      console.log('\n🚫 CIRCUIT BREAKER IS ACTIVE - This is preventing LLM operations!');
      console.log('   This could be why sync is not processing emails.');
      
      // Try to reset it
      const resetHandler = mockIPC.getHandler('ml:reset-circuit-breaker');
      if (resetHandler) {
        console.log('\n🔄 Attempting to reset circuit breaker...');
        const resetResult = await resetHandler();
        console.log('Reset Result:', resetResult);
      }
    } else {
      console.log('\n✅ Circuit breaker is not active - LLM operations should work normally');
    }
    
  } catch (error) {
    console.log('❌ Error checking circuit breaker:', error.message);
  }
}

checkCircuitBreakerStatus().catch(console.error);