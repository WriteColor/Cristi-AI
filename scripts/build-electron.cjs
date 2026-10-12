'use strict';
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const external = ['electron', '@modelcontextprotocol/sdk', 'zod', 'node:sqlite', 'playwright-core'];
function options() {
  return [
    { entryPoints: [path.join(root, 'electron/src/utility/memory.worker.ts')], outfile: path.join(root, 'electron/dist/memory.worker.cjs'), external },
    { entryPoints: [path.join(root, 'electron/src/utility/screen.worker.ts')], outfile: path.join(root, 'electron/dist/screen.worker.cjs'), external },
    { entryPoints: [path.join(root, 'electron/src/main.ts')], outfile: path.join(root, 'electron/dist/main.cjs'), external },
    ...['main', 'settings', 'camera', 'telemetry'].map(kind => ({ entryPoints: [path.join(root, `electron/src/preloads/${kind}.preload.ts`)], outfile: path.join(root, `electron/dist/${kind}.preload.cjs`), external: ['electron'] })),
  ].map(config => ({ ...config, bundle: true, platform: 'node', target: 'node22', format: 'cjs', sourcemap: false, logLevel: 'warning' }));
}
function buildElectron() { for (const config of options()) esbuild.buildSync(config); }
async function watchElectron() {
  const contexts = await Promise.all(options().map(config => esbuild.context(config)));
  await Promise.all(contexts.map(context => context.watch()));
  console.log('[BuildElectron] Observando main y cuatro preloads aislados.');
}
if (require.main === module) {
  if (process.argv.includes('--watch')) watchElectron().catch(error => { console.error(error); process.exit(1); });
  else buildElectron();
}
module.exports = { buildElectron, watchElectron };
