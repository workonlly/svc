const { drive } = require('./app/db/doogledrive');

async function testDrive() {
  try {
    const folderId = '1XDmocQtM9Rh6OeQ4FIR9aX62JHqSDxYl';
    const res = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'files(id, name, mimeType)',
    });
    console.log("Files in folder:", res.data.files);
  } catch (err) {
    console.error("Error reading drive:", err.message);
  }
}

testDrive();
