#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch (_) {
    console.error('Run: npm install');
    process.exit(1);
  }

  const root = path.join(__dirname, '..');
  const iconSvg = path.join(root, 'icon.svg');
  const featureSvg = path.join(root, 'play-store', 'feature-graphic.svg');
  const outDir = path.join(root, 'play-store');
  const mipmapRoot = path.join(root, 'android', 'app', 'src', 'main', 'res');

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'screenshots'), { recursive: true });

  const iconBuf = fs.readFileSync(iconSvg);
  const featureBuf = fs.readFileSync(featureSvg);

  await sharp(iconBuf).resize(512, 512).png().toFile(path.join(outDir, 'icon-512.png'));
  console.log('Wrote play-store/icon-512.png');

  await sharp(featureBuf).resize(1024, 500).png().toFile(path.join(outDir, 'feature-graphic-1024x500.png'));
  console.log('Wrote play-store/feature-graphic-1024x500.png');

  const densities = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
  };

  for (const [folder, size] of Object.entries(densities)) {
    const dir = path.join(mipmapRoot, folder);
    fs.mkdirSync(dir, { recursive: true });
    const png = await sharp(iconBuf).resize(size, size).png().toBuffer();
    await sharp(png).toFile(path.join(dir, 'ic_launcher.png'));
    await sharp(png).toFile(path.join(dir, 'ic_launcher_round.png'));
    console.log(`Wrote android/.../${folder}/ic_launcher*.png (${size}px)`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
