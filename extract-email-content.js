// Helper function to extract email content from Gmail API payload
function extractEmailContent(message) {
  const result = {
    subject: '',
    from: '',
    body: '',
    date: ''
  };
  
  // Extract from payload headers
  if (message.payload && message.payload.headers) {
    for (const header of message.payload.headers) {
      switch (header.name.toLowerCase()) {
        case 'subject':
          result.subject = header.value;
          break;
        case 'from':
          result.from = header.value;
          break;
        case 'date':
          result.date = header.value;
          break;
      }
    }
  }
  
  // Extract body content
  result.body = extractBodyContent(message.payload) || message.snippet || '';
  
  // Use snippet as fallback for subject if needed
  if (!result.subject && message.snippet) {
    result.subject = message.snippet.substring(0, 100);
  }
  
  return result;
}

function extractBodyContent(payload) {
  if (!payload) return '';
  
  let body = '';
  
  // Check for direct body content
  if (payload.body && payload.body.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  
  // Check parts for multipart messages
  if (!body && payload.parts) {
    for (const part of payload.parts) {
      // Look for text/plain parts
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        body = Buffer.from(part.body.data, 'base64').toString('utf8');
        break;
      }
      // Recursively check nested parts
      if (part.parts) {
        body = extractBodyContent(part);
        if (body) break;
      }
    }
  }
  
  return body;
}

module.exports = { extractEmailContent };