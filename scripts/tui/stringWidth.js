// Expresión regular universal para secuencias de escape ANSI (SGR, cursor, etc.)
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

export function stripAnsi(str) {
  return typeof str === 'string' ? str.replace(ANSI_REGEX, '') : '';
}

export function getVisibleWidth(str) {
  if (!str) return 0;
  const clean = stripAnsi(String(str));
  let width = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.codePointAt(i);
    if (code > 0xffff) i++; // Manejar surrogate pairs

    // Caracteres CJK, Hangul, Emojis de ancho doble (East Asian Wide)
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff00 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff)
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export function padRight(str, targetWidth) {
  const currentWidth = getVisibleWidth(str);
  if (currentWidth >= targetWidth) return str;
  return str + ' '.repeat(targetWidth - currentWidth);
}

export function padLeft(str, targetWidth) {
  const currentWidth = getVisibleWidth(str);
  if (currentWidth >= targetWidth) return str;
  return ' '.repeat(targetWidth - currentWidth) + str;
}

export function padCenter(str, targetWidth) {
  const currentWidth = getVisibleWidth(str);
  if (currentWidth >= targetWidth) return str;
  const totalSpaces = targetWidth - currentWidth;
  const leftSpaces = Math.floor(totalSpaces / 2);
  const rightSpaces = totalSpaces - leftSpaces;
  return ' '.repeat(leftSpaces) + str + ' '.repeat(rightSpaces);
}

export function truncate(str, maxWidth) {
  const current = getVisibleWidth(str);
  if (current <= maxWidth) return str;
  if (maxWidth <= 0) return '';
  if (maxWidth === 1) return '…';

  let result = '';
  let curWidth = 0;
  // Preservar secuencias ANSI sin contarlas para el ancho visual
  const tokenRegex = new RegExp(`(?:${ANSI_REGEX.source})|([\\s\\S])`, 'gu');
  let match;
  while ((match = tokenRegex.exec(str)) !== null) {
    const token = match[0];
    if (match[1] === undefined) {
      // Secuencia ANSI de ancho cero
      result += token;
    } else {
      const w = getVisibleWidth(token);
      if (curWidth + w > maxWidth - 1) {
        break;
      }
      result += token;
      curWidth += w;
    }
  }
  return result + '…';
}

export default {
  stripAnsi,
  getVisibleWidth,
  padRight,
  padLeft,
  padCenter,
  truncate
};
