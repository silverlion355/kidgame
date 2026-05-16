const fs = require('fs');

const TOKEN_URL = 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal';
const MSG_URL = 'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id';
const USER_ID = 'ou_e29bb5900c6bb809e8987e64be1b673b';

const APP_ID = 'cli_a97ae0dd73b81bd4';
const APP_SECRET = 'mV5QTa5hK8Ph43DLHT0LmeBZH5KTolWn';

const APK_PATH = '/workspace/kidgame-android/apktmp/app-debug.apk';
const CHUNK_SIZE = 30000; // 30KB per message

async function getToken() {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
  });
  const data = await res.json();
  return data.tenant_access_token;
}

async function sendMessage(token, text, part, total) {
  const res = await fetch(MSG_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: USER_ID,
      msg_type: 'text',
      content: JSON.stringify({ text: `[${part}/${total}] ${text}` })
    })
  });
  const data = await res.json();
  return data;
}

async function main() {
  console.log('Reading APK and encoding to base64...');
  const apkBuffer = fs.readFileSync(APK_PATH);
  const b64 = apkBuffer.toString('base64');
  console.log(`APK size: ${apkBuffer.length} bytes, Base64 length: ${b64.length}`);

  // Split into chunks
  const chunks = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE));
  }
  console.log(`Split into ${chunks.length} chunks of ${CHUNK_SIZE} bytes`);

  // Get token
  const token = await getToken();
  console.log('Token obtained');

  // Send header
  await sendMessage(token, `APK_START|${apkBuffer.length}|${chunks.length}|base64_follows`, 0, chunks.length);
  await new Promise(r => setTimeout(r, 500));

  // Send chunks
  for (let i = 0; i < chunks.length; i++) {
    await sendMessage(token, chunks[i], i + 1, chunks.length);
    console.log(`Sent chunk ${i + 1}/${chunks.length}`);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('All chunks sent!');
}

main().catch(console.error);