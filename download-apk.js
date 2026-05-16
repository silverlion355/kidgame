const https = require('https');
const fs = require('fs');

const options = {
  hostname: 'api.github.com',
  path: '/repos/silverlion355/kidgame/actions/artifacts/7031412083/zip',
  method: 'GET',
  headers: {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'kidgame-builder'
  }
};

const file = fs.createWriteStream('/tmp/kidgame-v1.17.zip');
https.get(options, (res) => {
  console.log('Status:', res.statusCode);
  res.pipe(file);
  file.on('finish', () => {
    file.close();
    const stat = fs.statSync('/tmp/kidgame-v1.17.zip');
    console.log('Downloaded:', stat.size, 'bytes');
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});