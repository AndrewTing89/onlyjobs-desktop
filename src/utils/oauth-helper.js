// OAuth Helper - Auto-redirect script
// Run this in the browser console when you see the JSON success response

console.log('🔄 OAuth Helper - Redirecting back to frontend...');

// Check if we're on the backend URL and see JSON response
if (window.location.hostname.includes('manage-tokens') || 
    document.body.textContent.includes('"status":"received"')) {
    
    console.log('✅ Detected OAuth success, redirecting to frontend...');
    
    // Show a temporary success message
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            background-color: #f5f5f5;
            margin: 0;
        ">
            <div style="
                width: 48px;
                height: 48px;
                border-radius: 50%;
                background-color: #4caf50;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                margin-bottom: 16px;
            ">✓</div>
            <h2 style="color: #333; margin-bottom: 8px;">Gmail Connected Successfully!</h2>
            <p style="color: #666; text-align: center;">Redirecting you back to settings...</p>
            <div style="
                border: 2px solid #f3f3f3;
                border-top: 2px solid #FF7043;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                animation: spin 1s linear infinite;
                margin: 16px auto;
            "></div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    
    // Redirect after 2 seconds
    setTimeout(() => {
        window.location.href = 'http://localhost:3000/settings?success=gmail-connected';
    }, 2000);
    
} else {
    console.log('❌ Not on OAuth success page');
}