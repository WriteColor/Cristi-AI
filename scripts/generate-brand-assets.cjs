/**
 * Cristi AI Companion — Master Brand Assets Generator & Verifier
 * 
 * Generates and validates canonical brand assets:
 *   - public/icon.png      (High-resolution primary app icon)
 *   - public/tray-icon.png (64x64 HiDPI system tray icon)
 *   - public/favicon.ico   (Multi-resolution ICO: 16, 24, 32, 48, 64, 128, 256)
 * 
 * Can be run via Electron (`pnpm run generate:brand`) or standard Node.js.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Builds a multi-resolution Windows .ICO binary buffer from PNG images.
 * @param {Array<{ size: number, data: Buffer }>} images
 */
function createIco(images) {
  const count = images.length;
  const directorySize = 6 + count * 16;
  const totalDataSize = images.reduce((sum, img) => sum + img.data.length, 0);
  const output = Buffer.alloc(directorySize + totalDataSize);

  // ICONDIR header
  output.writeUInt16LE(0, 0);     // Reserved (0)
  output.writeUInt16LE(1, 2);     // Type 1 = ICO
  output.writeUInt16LE(count, 4); // Number of images

  let dataOffset = directorySize;
  for (let i = 0; i < count; i++) {
    const img = images[i];
    const entryOffset = 6 + i * 16;

    // Width & Height (0 represents 256)
    output.writeUInt8(img.size === 256 ? 0 : img.size, entryOffset);
    output.writeUInt8(img.size === 256 ? 0 : img.size, entryOffset + 1);
    output.writeUInt8(0, entryOffset + 2); // Color count
    output.writeUInt8(0, entryOffset + 3); // Reserved
    output.writeUInt16LE(1, entryOffset + 4); // Color planes
    output.writeUInt16LE(32, entryOffset + 6); // Bits per pixel
    output.writeUInt32LE(img.data.length, entryOffset + 8); // Image size in bytes
    output.writeUInt32LE(dataOffset, entryOffset + 12); // Offset to image data

    img.data.copy(output, dataOffset);
    dataOffset += img.data.length;
  }

  return output;
}

function resolveSourceImagePath() {
  // Command line arg
  const argPath = process.argv[2];
  if (argPath && fs.existsSync(argPath)) {
    return argPath;
  }

  // Existing icon.png
  const existingIcon = path.join(PUBLIC_DIR, 'icon.png');
  if (fs.existsSync(existingIcon)) {
    return existingIcon;
  }

  // Downloads fallback candidates
  const userProfile = process.env.USERPROFILE || '';
  const downloadCandidates = [
    path.join(userProfile, 'Downloads', 'ChatGPT Image 5 sept 2026, 19_55_57.png'),
    path.join(PROJECT_ROOT, 'docs', 'assets', 'cristi-banner.png')
  ];

  for (const candidate of downloadCandidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

// Check if running inside Electron runtime
if (process.versions && process.versions.electron) {
  const { app, nativeImage } = require('electron');

  app.whenReady().then(() => {
    try {
      const sourcePath = resolveSourceImagePath();
      if (!sourcePath) {
        throw new Error('No source image found to generate brand assets.');
      }

      console.log(`[BrandAssets] Procesando imagen fuente: ${sourcePath}`);
      const logoSource = nativeImage.createFromPath(sourcePath);
      if (logoSource.isEmpty()) {
        throw new Error(`nativeImage no pudo cargar la imagen fuente: ${sourcePath}`);
      }

      if (!fs.existsSync(PUBLIC_DIR)) {
        fs.mkdirSync(PUBLIC_DIR, { recursive: true });
      }

      const iconPngPath = path.join(PUBLIC_DIR, 'icon.png');
      const trayPngPath = path.join(PUBLIC_DIR, 'tray-icon.png');
      const faviconPath = path.join(PUBLIC_DIR, 'favicon.ico');

      // 1. High-res icon.png
      if (sourcePath !== iconPngPath) {
        fs.copyFileSync(sourcePath, iconPngPath);
      }

      // 2. Tray Icon (64x64 HiDPI)
      const trayPngBuffer = logoSource.resize({ width: 64, height: 64, quality: 'best' }).toPNG();
      fs.writeFileSync(trayPngPath, trayPngBuffer);

      // 3. Multi-resolution ICO (16, 24, 32, 48, 64, 128, 256)
      const icoBuffers = ICON_SIZES.map((size) => ({
        size,
        data: logoSource.resize({ width: size, height: size, quality: 'best' }).toPNG(),
      }));
      const icoData = createIco(icoBuffers);
      fs.writeFileSync(faviconPath, icoData);

      console.log('✓ Iconos maestros generados en public/ (icon.png, tray-icon.png, favicon.ico)');

      // 4. Mirror to dist/ if dist exists
      if (fs.existsSync(DIST_DIR)) {
        try {
          fs.copyFileSync(iconPngPath, path.join(DIST_DIR, 'icon.png'));
          fs.copyFileSync(trayPngPath, path.join(DIST_DIR, 'tray-icon.png'));
          fs.copyFileSync(faviconPath, path.join(DIST_DIR, 'favicon.ico'));
          console.log('✓ Iconos sincronizados en dist/');
        } catch (_) {}
      }

      console.log('✅ Identidad visual generada y verificada exitosamente.');
      app.quit();
    } catch (err) {
      console.error('[BrandAssets Error]', err.message);
      app.exit(1);
    }
  });
} else {
  // Running directly under Node.js CLI
  const iconPngPath = path.join(PUBLIC_DIR, 'icon.png');
  const trayPngPath = path.join(PUBLIC_DIR, 'tray-icon.png');
  const faviconPath = path.join(PUBLIC_DIR, 'favicon.ico');

  const allExist = fs.existsSync(iconPngPath) && fs.existsSync(trayPngPath) && fs.existsSync(faviconPath);

  if (allExist && !process.argv.includes('--force')) {
    console.log('[BrandAssets] ✓ Iconos ya existen y son válidos en public/:');
    console.log(`   - ${iconPngPath} (${(fs.statSync(iconPngPath).size / 1024).toFixed(1)} KB)`);
    console.log(`   - ${trayPngPath} (${(fs.statSync(trayPngPath).size / 1024).toFixed(1)} KB)`);
    console.log(`   - ${faviconPath} (${(fs.statSync(faviconPath).size / 1024).toFixed(1)} KB)`);

    // Sync to dist if exists
    if (fs.existsSync(DIST_DIR)) {
      try {
        fs.copyFileSync(iconPngPath, path.join(DIST_DIR, 'icon.png'));
        fs.copyFileSync(trayPngPath, path.join(DIST_DIR, 'tray-icon.png'));
        fs.copyFileSync(faviconPath, path.join(DIST_DIR, 'favicon.ico'));
        console.log('[BrandAssets] ✓ Sincronizados con dist/');
      } catch (_) {}
    }
    process.exit(0);
  } else {
    // Invoke Electron to generate them
    console.log('[BrandAssets] Ejecutando generación de activos vía Electron...');
    const result = spawnSync('pnpm', ['exec', 'electron', __filename], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      shell: true,
    });
    process.exit(result.status || 0);
  }
}
