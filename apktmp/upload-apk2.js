const https = require('https');
const fs = require('fs');
const path = require('path');

const APP_ID = 'cli_a97ae0dd73b81bd4';
const APP_SECRET = 'mV5QTa5hK8Ph43DLHT0LmeBZH5KTolWn';
const USER_ID = 'ou_e29bb5900c6bb809e8987e64be1b673b';

const TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const UPLOAD_URL = 'https://open.feishu.cn/open-apis/im/v1/files';
const MSG_URL = 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id';

const APK_PATH = '/workspace/kidgame-android/apktmp/app-debug.apk';

function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

function uploadFile(token, filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----FormBoundary' + Date.now();
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/octet-stream\r\n\r\n`
    );
    const footer = Buffer.from(`\r\n--${boundary}--`);

    const body = Buffer.concat([header, fileContent, footer]);

    const urlObj = new URL(UPLOAD_URL);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  // Get token
  const tokenRes = await postJson(TOKEN_URL, { app_id: APP_ID, app_secret: APP_SECRET });
  const token = tokenRes.tenant_access_token;
  console.log('Token:', token ? 'OK' : 'FAIL');

  // Upload APK
  console.log('Uploading APK...');
  const uploadRes = await uploadFile(token, APK_PATH);
  console.log('Upload result:', JSON.stringify(uploadRes));

  if (uploadRes.code !== 0) {
    console.error('Upload failed!');
    return;
  }

  // Send file message
  const fileKey = uploadRes.data.file_key;
  const msgRes = await postJson(MSG_URL, {
    receive_id: USER_ID,
    msg_type: 'file',
    content: JSON.stringify({ file_key: fileKey })
  }, token);
  console.log('Message result:', JSON.stringify(msgRes));
}

main().catch(console.error);