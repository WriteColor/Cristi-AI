#!/usr/bin/env node
import readline from 'node:readline';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { drawBox, drawRow, COLORS } from './box.js';
import { padCenter } from './stringWidth.js';
import { runFullDiagnostics } from './diagnostics.js';
import { compileWasapiHelper, compileInputHelper, compileElectron, cleanArtifacts, runPostInstall } from './actions.js';

export const WIDTH = 76;

export function renderBanner(width = WIDTH) {
  const innerWidth = width - 2;
  const rawArt = [
    '   ██████╗██████╗ ██╗███████╗████████╗██╗     █████╗ ██╗',
    '  ██╔════╝██╔══██╗██║██╔════╝╚══██╔══╝██║    ██╔══██╗██║',
    '  ██║     ██████╔╝██║███████╗   ██║   ██║    ███████║██║',
    '  ██║     ██╔══██╗██║╚════██║   ██║   ██║    ██╔══██║██║',
    '  ╚██████╗██║  ██║██║███████║   ██║   ██║    ██║  ██║██║',
    '   ╚═════╝╚═╝  ╚═╝╚═╝╚══════╝   ╚═╝   ╚═╝    ╚═╝  ╚═╝╚═╝'
  ];

  const lines = rawArt.map((line) =>
    padCenter(`${COLORS.magenta}${COLORS.bold}${line}${COLORS.reset}`, innerWidth)
  );
  lines.push('---');
  lines.push(padCenter(`${COLORS.cyan}CENTRO DE CONTROL, INSTALACIÓN Y DIAGNÓSTICO DEL ENTORNO${COLORS.reset}`, innerWidth));
  lines.push(padCenter(`${COLORS.gray}Versión 1.0.0 • Entorno Windows x64 • Node ${process.version}${COLORS.reset}`, innerWidth));

  return drawBox({
    title: 'CRISTI AI COMPANION',
    width,
    lines,
    borderColor: COLORS.magenta
  });
}

export function renderDiagnosticsBox(report, width = WIDTH) {
  const lines = [];
  for (const item of report.items) {
    let tag = '';
    if (item.status === 'OK') tag = `${COLORS.green}[OK]${COLORS.reset}`;
    else if (item.status === 'WARN') tag = `${COLORS.yellow}[WARN]${COLORS.reset}`;
    else tag = `${COLORS.red}[FAIL]${COLORS.reset}`;

    const left = `${tag} ${COLORS.bold}${item.name}${COLORS.reset}`;
    let details = item.details;
    if (item.id === 'wasapi' && details === 'native/CristiWasapiLoopback.exe compilado') {
      details = 'CristiWasapiLoopback.exe compilado';
    }
    const right = `${COLORS.gray}${details}${COLORS.reset}`;
    lines.push(drawRow(left, right, width));
  }

  return drawBox({
    title: 'ESTADO Y SALUD DEL ENTORNO',
    width,
    lines,
    borderColor: COLORS.cyan
  });
}

export function renderMenuBox(width = WIDTH) {
  const options = [
    `${COLORS.bold}${COLORS.white} [1]${COLORS.reset}  ${COLORS.cyan}Preparar Entorno Completo${COLORS.reset} (WASAPI, CristiInput, Electron & Verificación)`,
    `${COLORS.bold}${COLORS.white} [2]${COLORS.reset}  ${COLORS.green}Recompilar Procesos de Electron${COLORS.reset} (esbuild main & preloads)`,
    `${COLORS.bold}${COLORS.white} [3]${COLORS.reset}  ${COLORS.yellow}Limpiar Cachés y Builds Locales${COLORS.reset} (dist, release, electron/dist)`,
    `${COLORS.bold}${COLORS.white} [4]${COLORS.reset}  ${COLORS.magenta}Re-auditar Salud del Entorno${COLORS.reset} (análisis en tiempo real)`,
    `${COLORS.bold}${COLORS.white} [5]${COLORS.reset}  ${COLORS.white}Iniciar Aplicación en Desarrollo${COLORS.reset} (pnpm dev)`,
    `${COLORS.bold}${COLORS.white} [0]${COLORS.reset}  ${COLORS.gray}Salir${COLORS.reset}`
  ];

  return drawBox({
    title: 'ACCIONES DISPONIBLES',
    width,
    lines: options,
    borderColor: COLORS.white
  });
}

export function waitPrompt() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(` ${COLORS.gray}Presiona ENTER para continuar...${COLORS.reset}`, () => {
      rl.close();
      resolve();
    });
  });
}

export async function showInteractive() {
  if (process.stdout.isTTY) {
    console.clear();
  }
  console.log(renderBanner());
  console.log('');

  const report = await runFullDiagnostics();
  console.log(renderDiagnosticsBox(report));
  console.log('');
  console.log(renderMenuBox());
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(` ${COLORS.cyan}${COLORS.bold}Selecciona una opción [0-5]: ${COLORS.reset}`, async (answer) => {
    rl.close();
    const choice = answer.trim();

    if (choice === '1') {
      console.log(`\n${COLORS.cyan}→ Ejecutando preparación de entorno...${COLORS.reset}`);
      compileWasapiHelper();
      compileInputHelper();
      compileElectron();
      console.log(`${COLORS.green}✓ Entorno preparado exitosamente.${COLORS.reset}\n`);
      await waitPrompt();
      showInteractive();
    } else if (choice === '2') {
      console.log(`\n${COLORS.cyan}→ Recompilando Electron...${COLORS.reset}`);
      compileElectron();
      console.log(`${COLORS.green}✓ Procesos compilados.${COLORS.reset}\n`);
      await waitPrompt();
      showInteractive();
    } else if (choice === '3') {
      cleanArtifacts();
      console.log(`${COLORS.green}✓ Archivos temporales eliminados.${COLORS.reset}\n`);
      await waitPrompt();
      showInteractive();
    } else if (choice === '4') {
      showInteractive();
    } else if (choice === '5') {
      console.log(`\n${COLORS.green}Iniciando aplicación Cristi AI en desarrollo...${COLORS.reset}\n`);
      const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
      const child = spawn(pnpmCmd, ['dev'], { stdio: 'inherit', shell: false });
      child.on('exit', () => showInteractive());
    } else {
      console.log(`\n${COLORS.gray}¡Hasta pronto!${COLORS.reset}\n`);
      process.exit(0);
    }
  });
}

export async function main(args = process.argv) {
  if (args.includes('--check')) {
    console.log(renderBanner());
    const report = await runFullDiagnostics();
    console.log(renderDiagnosticsBox(report));
    process.exit(report.allOk ? 0 : 1);
  }

  if (args.includes('--setup')) {
    compileWasapiHelper();
    compileInputHelper();
    compileElectron();
    console.log('[TUI] Entorno preparado exitosamente.');
    process.exit(0);
  }

  if (args.includes('--clean')) {
    cleanArtifacts();
    console.log('[TUI] Directorios dist/, release/ y electron/dist/ limpiados.');
    process.exit(0);
  }

  if (args.includes('--postinstall')) {
    runPostInstall();
    process.exit(0);
  }

  showInteractive();
}

const currentFilePath = fileURLToPath(import.meta.url);
const executedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (executedFilePath === currentFilePath) {
  main().catch((err) => {
    console.error('[TUI Error]', err);
    process.exit(1);
  });
}

export default {
  WIDTH,
  renderBanner,
  renderDiagnosticsBox,
  renderMenuBox,
  showInteractive,
  main
};
