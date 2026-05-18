const https = require('https');
const fs = require('fs');

// Download artifact from GitHub Actions
const ARTIFACT_ID = "7042761262";
const OUTPUT_PATH = "/workspace/kidgame-android/apktmp/kidgame-v1.28-debug.apk";

const options = {
  hostname: 'api.github.com',
  path: '/repos/silverlion355/kidgame/actions/artifacts/' + ARTIFACT_ID + '/zip',
  method: 'GET',
  headers: {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'kidgame-builder'
  }
};

console.log('Downloading artifact:', ARTIFACT_ID);
const file = fs.createWriteStream(OUTPUT_PATH);
https.get(options, (res) => {
  console.log('Status:', res.statusCode);
  if (res.statusCode === 200) {
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      const stat = fs.statSync(OUTPUT_PATH);
      console.log('Downloaded:', stat.size, 'bytes to', OUTPUT_PATH);
    });
  } else {
    console.error('Failed to download');
  }
}).on('error', (err) => {
  console.error('Error:', err.message);
});