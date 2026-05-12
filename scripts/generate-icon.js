const fs = require('fs');
const path = require('path');

// 奖杯图标生成 - 绘制一个简化的小奖杯
function generateTrophyIcon(size) {
  const pixels = [];
  const bgColor = [255, 255, 255, 255]; // 白底
  const fgColor = [255, 165, 0, 255];  // 橙色
  
  // 创建空白画布
  for (let y = 0; y < size; y++) {
    pixels[y] = [];
    for (let x = 0; x < size; x++) {
      pixels[y][x] = [...bgColor];
    }
  }
  
  // 绘制圆形背景
  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * 0.45;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (dist <= radius) {
        pixels[y][x] = [...fgColor];
      }
    }
  }
  
  // 绘制白色区域形成奖杯形状
  const trophyParts = [];
  
  // 杯身 (梯形区域)
  const cupTop = size * 0.25;
  const cupBottom = size * 0.65;
  const cupTopWidth = size * 0.3;
  const cupBottomWidth = size * 0.45;
  
  // 杯口 (椭圆)
  for (let y = Math.floor(cupTop - size * 0.08); y < cupTop + size * 0.1; y++) {
    const progress = (y - (cupTop - size * 0.08)) / (size * 0.18);
    const width = cupTopWidth + (cupBottomWidth - cupTopWidth) * Math.min(progress, 0.3);
    for (let x = 0; x < size; x++) {
      if (x >= centerX - width / 2 && x <= centerX + width / 2) {
        if (y >= 0 && y < size) {
          pixels[Math.floor(y)][x] = [...bgColor];
        }
      }
    }
  }
  
  // 杯身
  for (let y = Math.floor(cupTop); y < Math.floor(cupBottom); y++) {
    const progress = (y - cupTop) / (cupBottom - cupTop);
    const width = cupTopWidth * (1 - progress * 0.2) + cupBottomWidth * progress * 0.6;
    for (let x = 0; x < size; x++) {
      if (x >= centerX - width / 2 && x <= centerX + width / 2) {
        if (y >= 0 && y < size) {
          pixels[y][x] = [...bgColor];
        }
      }
    }
  }
  
  // 杯底
  const baseTop = cupBottom;
  const baseBottom = size * 0.72;
  for (let y = Math.floor(baseTop); y < Math.floor(baseBottom); y++) {
    const width = cupBottomWidth * 0.9;
    for (let x = 0; x < size; x++) {
      if (x >= centerX - width / 2 && x <= centerX + width / 2) {
        if (y >= 0 && y < size) {
          pixels[y][x] = [...bgColor];
        }
      }
    }
  }
  
  // 左把手
  const handleLeft = size * 0.18;
  const handleY1 = size * 0.35;
  const handleY2 = size * 0.55;
  for (let y = Math.floor(handleY1); y < Math.floor(handleY2); y++) {
    const progress = (y - handleY1) / (handleY2 - handleY1);
    const handleX = centerX - cupTopWidth * 0.9;
    const handleRadius = size * 0.08;
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - handleX) ** 2 + (y - centerY * 1.05) ** 2);
      if (dist <= handleRadius) {
        if (y >= 0 && y < size && x >= 0 && x < size) {
          pixels[y][x] = [...bgColor];
        }
      }
    }
  }
  
  // 右把手
  for (let y = Math.floor(handleY1); y < Math.floor(handleY2); y++) {
    const handleX = centerX + cupTopWidth * 0.9;
    const handleRadius = size * 0.08;
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - handleX) ** 2 + (y - centerY * 1.05) ** 2);
      if (dist <= handleRadius) {
        if (y >= 0 && y < size && x >= 0 && x < size) {
          pixels[y][x] = [...bgColor];
        }
      }
    }
  }
  
  // 底座
  const standTop = baseBottom;
  const standBottom = size * 0.78;
  for (let y = Math.floor(standTop); y < Math.floor(standBottom); y++) {
    const width = size * 0.35;
    for (let x = 0; x < size; x++) {
      if (x >= centerX - width / 2 && x <= centerX + width / 2) {
        if (y >= 0 && y < size) {
          pixels[y][x] = [...bgColor];
        }
      }
    }
  }
  
  return pixels;
}

function createPNG(width, height, pixels) {
  // PNG 简单实现
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR
  const ihdr = createIHDRChunk(width, height);
  
  // IDAT - 使用简单压缩
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter type
    for (let x = 0; x < width; x++) {
      rawData.push(...pixels[y][x]);
    }
  }
  
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const idat = createChunk('IDAT', compressed);
  
  // IEND
  const iend = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createIHDRChunk(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data.writeUInt8(8, 8);  // bit depth
  data.writeUInt8(6, 9);  // color type (RGBA)
  data.writeUInt8(0, 10); // compression
  data.writeUInt8(0, 11); // filter
  data.writeUInt8(0, 12); // interlace
  return createChunk('IHDR', data);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  
  const result = Buffer.alloc(4);
  result.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, 0);
  return result;
}

// 生成各尺寸图标
const sizes = [
  { name: 'mdpi', size: 48 },
  { name: 'hdpi', size: 72 },
  { name: 'xhdpi', size: 96 },
  { name: 'xxhdpi', size: 144 },
  { name: 'xxxhdpi', size: 192 }
];

sizes.forEach(({ name, size }) => {
  const pixels = generateTrophyIcon(size);
  const png = createPNG(size, size, pixels);
  const dir = `/workspace/kidgame-android/app/src/main/res/mipmap-${name}`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/ic_launcher.png`, png);
  console.log(`Generated ${name}: ${size}x${size}`);
});

console.log('Trophy icon generated!');
