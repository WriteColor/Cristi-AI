/**
 * Worker thread para procesamiento de imagenes de captura de pantalla.
 * Recibe bytes BGRA raw desde el proceso main y devuelve un string base64 JPEG procesado.
 * Corre en un hilo separado para descargar el proceso main de trabajo CPU-bound.
 */

import { parentPort } from 'node:worker_threads';
import jpeg from 'jpeg-js';

if (!parentPort) throw new Error('screen.worker debe ejecutarse como worker thread');

type ScreenRequest = {
  id: number;
  width: number;
  height: number;
  /** Buffer BGRA raw proveniente de NativeImage.toBitmap() */
  buffer: ArrayBuffer;
  region: { x_pct: number; y_pct: number; w_pct: number; h_pct: number } | null;
  jpegQuality: number;
};

type ScreenReply = {
  id: number;
  base64: string | null;
  error?: string;
};

/**
 * Recorta un buffer BGRA y convierte simultaneamente de BGRA a RGBA.
 * Copia pixel a pixel intercambiando los canales B (indice 0) y R (indice 2).
 */
function cropAndConvertBgraToRgba(
  buf: Buffer<ArrayBuffer>,
  srcW: number,
  cropX: number,
  cropY: number,
  cropW: number,
  cropH: number
): Buffer<ArrayBuffer> {
  const result = Buffer.allocUnsafe(cropW * cropH * 4) as Buffer<ArrayBuffer>;
  for (let row = 0; row < cropH; row++) {
    const srcRowOffset = ((cropY + row) * srcW + cropX) * 4;
    const dstRowOffset = row * cropW * 4;
    for (let col = 0; col < cropW; col++) {
      const srcPx = srcRowOffset + col * 4;
      const dstPx = dstRowOffset + col * 4;
      result[dstPx] = buf[srcPx + 2];     // R
      result[dstPx + 1] = buf[srcPx + 1]; // G
      result[dstPx + 2] = buf[srcPx];     // B
      result[dstPx + 3] = buf[srcPx + 3]; // A
    }
  }
  return result;
}

/**
 * Convierte un buffer BGRA a RGBA in-place intercambiando B y R.
 */
function convertBgraToRgbaInPlace(buf: Buffer<ArrayBuffer>): void {
  for (let i = 0; i < buf.length; i += 4) {
    const b = buf[i];
    buf[i] = buf[i + 2];     // R
    buf[i + 2] = b;          // B
  }
}

/**
 * Codifica un buffer RGBA como JPEG usando jpeg-js de forma determinista y sin dependencias C++ externas.
 */
function encodeJpeg(
  rgbaBuf: Buffer<ArrayBuffer>,
  width: number,
  height: number,
  quality: number
): string {
  const jpegImageData = jpeg.encode({
    data: rgbaBuf,
    width,
    height
  }, Math.max(1, Math.min(100, Math.round(quality))));

  return jpegImageData.data.toString('base64');
}

parentPort.on('message', (request: ScreenRequest) => {
  const { id, width, height, buffer, region, jpegQuality } = request;

  try {
    let buf: Buffer<ArrayBuffer> = Buffer.from(buffer as ArrayBuffer) as Buffer<ArrayBuffer>;
    let w = width;
    let h = height;

    // Aplicar recorte si la region no cubre la imagen completa
    if (
      region &&
      (region.x_pct > 0 || region.y_pct > 0 || region.w_pct < 100 || region.h_pct < 100)
    ) {
      const cropX = Math.max(0, Math.round((region.x_pct / 100) * w));
      const cropY = Math.max(0, Math.round((region.y_pct / 100) * h));
      const cropW = Math.max(1, Math.min(w - cropX, Math.round((region.w_pct / 100) * w)));
      const cropH = Math.max(1, Math.min(h - cropY, Math.round((region.h_pct / 100) * h)));
      buf = cropAndConvertBgraToRgba(buf, w, cropX, cropY, cropW, cropH);
      w = cropW;
      h = cropH;
    } else {
      // Conversion de canales directa in-place
      convertBgraToRgbaInPlace(buf);
    }

    const base64 = encodeJpeg(buf, w, h, jpegQuality);
    const reply: ScreenReply = { id, base64 };
    parentPort!.postMessage(reply);
  } catch (err) {
    const reply: ScreenReply = { id, base64: null, error: (err as Error).message };
    parentPort!.postMessage(reply);
  }
});
