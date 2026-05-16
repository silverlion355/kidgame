const https = require('https');
const fs = require('fs');
const path = require('path');

const APP_ID = 'cli_a97ae0dd73b81bd4';
const APP_SECRET = 'mV5QTa5hK8Ph43DLHT0LmeBZH5KTolWn';
const USER_ID = 'ou_e29bb5900c6bb809e8987e64be1b673b';

const TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const UPLOAD_URL = 'https://open.feishu.cn/open-apis/im/v1/files';
const MSG_URL = 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id';

const APK_PATHS = [
  '/workspace/kidgame-android/apktmp/app-v3.9.apk'
];

function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(bodyStr)
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
    req.write(bodyStr);
    req.end();
  });
}

async function uploadFile(token, filePath) {
  const fileName = path.basename(filePath);
  const fileContent = fs.readFileSync(filePath);
  const boundary = '----LarkUploadBoundary' + Date.now();

  const parts = [];
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_name"\r\n\r\n${fileName}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file_type"\r\n\r\nstream\r\n`));

  const fileHeader = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n`
  );
  const fileFooter = Buffer.from(`\r\n--${boundary}--`);

  const totalBody = Buffer.concat([...parts, fileHeader, fileContent, fileFooter]);

  return new Promise((resolve, reject) => {
    const urlObj = new URL(UPLOAD_URL);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': totalBody.length
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
    req.write(totalBody);
    req.end();
  });
}

async function main() {
  const tokenRes = await postJson(TOKEN_URL, { app_id: APP_ID, app_secret: APP_SECRET });
  const token = tokenRes.tenant_access_token;
  console.log('Token OK');

  for (const apkPath of APK_PATHS) {
    console.log(`Uploading ${apkPath}...`);
    const uploadRes = await uploadFile(token, apkPath);
    console.log('Upload:', JSON.stringify(uploadRes));

    if (uploadRes.code !== 0) {
      console.error('Upload failed!');
      continue;
    }

    const fileKey = uploadRes.data.file_key;
    const msgRes = await postJson(MSG_URL, {
      receive_id: USER_ID,
      msg_type: 'file',
      content: JSON.stringify({ file_key: fileKey })
    }, token);
    console.log('Message sent:', JSON.stringify(msgRes));
  }
}

main().catch(console.error);