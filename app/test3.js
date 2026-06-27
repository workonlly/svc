require('dotenv').config({path: '../.env'});
const { drive } = require('./db/doogledrive');
drive.files.list({ q: `'${process.env.NEXT_PUBLIC_LITERACY_WORKS}' in parents and trashed = false`, fields: 'files(id, name, webViewLink, mimeType)' })
  .then(r => console.log("Works:", r.data.files))
  .catch(e => console.log(e));
