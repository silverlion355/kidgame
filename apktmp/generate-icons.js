const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputPath = '/workspace/.cc-connect/attachments/img_1778751921409_0.png';
const outputDir = '/workspace/kidgame-android/app/src/main/res';

// Icon sizes for Android mipmap directories
const sizes = [
  { name: 'mipmap-mdpi', size: 48 },
  { name: 'mipmap-hdpi', size: 72 },
  { name: 'mipmap-xhdpi', size: 96 },
  { name: 'mipmap-xxhdpi', size: 144 },
  { name: 'mipmap-xxxhdpi', size: 192 }
];

async function generateIcons() {
  console.log('Reading input image...');
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  console.log(`Image size: ${metadata.width}x${metadata.height}`);

  // Create rounded square version with padding
  const baseSize = Math.max(metadata.width, metadata.height);
  const padding = Math.floor(baseSize * 0.1);
  const squareSize = baseSize + padding * 2;

  // Create circular mask for rounded icon
  const svg = `
    <svg width="${squareSize}" height="${squareSize}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${squareSize}" height="${squareSize}" rx="${padding}" ry="${padding}" fill="white"/>
    </svg>
  `;

  const roundedImage = await sharp(inputPath)
    .resize(squareSize, squareSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  for (const { name, size } of sizes) {
    const dir = path.join(outputDir, name);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const outputPath = path.join(dir, 'ic_launcher.png');
    await sharp(roundedImage)
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(outputPath);
    console.log(`Generated ${outputPath} (${size}x${size})`);
  }

  // Also create adaptive icon XML for Android 8+
  const mipmapAnyDir = path.join(outputDir, 'mipmap-anydpi-v26');
  if (!fs.existsSync(mipmapAnyDir)) {
    fs.mkdirSync(mipmapAnyDir, { recursive: true });
  }

  // Create foreground layer
  const fgSvg = `
    <svg width="108" height="108" viewBox="0 0 108 108" xmlns="http://www.w3.org/2000/svg">
      <g>
        <rect width="108" height="108" fill="white"/>
        <image x="0" y="0" width="108" height="108" href="data:image/png;base64,${roundedImage.toString('base64')}"/>
      </g>
    </svg>
  `;

  const fgPath = path.join(mipmapAnyDir, 'ic_launcher_foreground.png');
  await sharp(inputPath)
    .resize(108, 108, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(fgPath);
  console.log(`Generated ${fgPath}`);

  const bgPath = path.join(mipmapAnyDir, 'ic_launcher_background.png');
  // Create white background
  await sharp({
    create: {
      width: 108,
      height: 108,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  }).png().toFile(bgPath);
  console.log(`Generated ${bgPath}`);

  // Create adaptive icon XML
  const foregroundXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>`;

  fs.writeFileSync(path.join(mipmapAnyDir, 'ic_launcher.xml'), foregroundXml);
  console.log('Generated adaptive icon XML');

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(console.error);