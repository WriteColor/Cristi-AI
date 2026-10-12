import { getVisibleWidth, padRight, padCenter, truncate } from './stringWidth.js';

export const BORDERS = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  dividerLeft: '├',
  dividerRight: '┤',
  dividerHorizontal: '─'
};

export const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  white: '\x1b[37m'
};

export function drawBox({ title = '', width = 70, lines = [], borderColor = COLORS.cyan }) {
  const innerWidth = width - 2;
  const output = [];

  // 1. Línea superior con título centrado si existe
  if (title) {
    const rawTitle = title.trim();
    const maxTitleWidth = innerWidth - 4;
    const cleanTitle = getVisibleWidth(rawTitle) > maxTitleWidth
      ? ` ${truncate(rawTitle, maxTitleWidth)} `
      : ` ${rawTitle} `;
    const titleWidth = getVisibleWidth(cleanTitle);
    const available = innerWidth - titleWidth;
    const leftCount = Math.max(1, Math.floor(available / 2));
    const rightCount = Math.max(1, available - leftCount);
    output.push(
      `${borderColor}${BORDERS.topLeft}${BORDERS.horizontal.repeat(leftCount)}${COLORS.bold}${COLORS.white}${cleanTitle}${COLORS.reset}${borderColor}${BORDERS.horizontal.repeat(rightCount)}${BORDERS.topRight}${COLORS.reset}`
    );
  } else {
    output.push(`${borderColor}${BORDERS.topLeft}${BORDERS.horizontal.repeat(innerWidth)}${BORDERS.topRight}${COLORS.reset}`);
  }

  // 2. Líneas de contenido perfectamente ajustadas al ancho interior
  for (const line of lines) {
    if (line === '---') {
      output.push(`${borderColor}${BORDERS.dividerLeft}${BORDERS.dividerHorizontal.repeat(innerWidth)}${BORDERS.dividerRight}${COLORS.reset}`);
    } else {
      const truncatedLine = truncate(line, innerWidth);
      const paddedLine = padRight(truncatedLine, innerWidth);
      output.push(`${borderColor}${BORDERS.vertical}${COLORS.reset}${paddedLine}${borderColor}${BORDERS.vertical}${COLORS.reset}`);
    }
  }

  // 3. Línea inferior
  output.push(`${borderColor}${BORDERS.bottomLeft}${BORDERS.horizontal.repeat(innerWidth)}${BORDERS.bottomRight}${COLORS.reset}`);
  return output.join('\n');
}

export function drawRow(label, value, width) {
  const inner = width - 4; // Borde y padding
  const labelWidth = getVisibleWidth(label);
  const valueWidth = getVisibleWidth(value);
  const availableSpace = inner - labelWidth - valueWidth;
  if (availableSpace <= 0) {
    return `${label}: ${value}`;
  }
  return ` ${label}${' '.repeat(availableSpace)}${value} `;
}

export default {
  BORDERS,
  COLORS,
  drawBox,
  drawRow
};
