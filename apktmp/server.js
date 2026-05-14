const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const APK_FILE = 'kidgame-v4.0-debug.zip';

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/list') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    res.end(`<html><body><h2>APK 下载</h2><a href="/${APK_FILE}">${APK_FILE}</a></body></html>`);
  } else {
    const filePath = path.join(__dirname, req.url === '/' ? APK_FILE : req.url);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename=${path.basename(filePath)}`
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Server running at http://0.0.0.0:' + PORT);
});