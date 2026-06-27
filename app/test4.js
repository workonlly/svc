require('dotenv').config({path: '../.env'});
const { drive } = require('./db/doogledrive');
drive.files.get({ fileId: '1We_f0E10B_XRNJB-nCDCl44wlbKGrKx8', alt: 'media' }, { responseType: 'json' })
  .then(r => console.log("JSON:", JSON.stringify(r.data, null, 2)))
  .catch(e => console.log(e));
