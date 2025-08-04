// This is a simple API endpoint for the web app to check desktop auth status
// In production, this would be a Firebase Function or server endpoint

export default function handler(req, res) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Code required' });
  }
  
  // In production, check Firebase Realtime Database for the token
  // For now, return a mock response
  res.status(200).json({ 
    token: null,
    message: 'Waiting for authorization' 
  });
}