const { google } = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();

// 1. Authenticate using environment variables directly
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    // Note: We use .replace() here to fix a common issue with how 
    // environment variables handle the \n (newline) characters in the key
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  scopes: ['https://www.googleapis.com/auth/drive.file', 'https://www.googleapis.com/auth/drive'], 
});

const drive = google.drive({ version: 'v3', auth });

module.exports = { drive };