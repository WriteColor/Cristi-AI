import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import semver from 'semver';

export const isNewerVersion = (candidate: string, current: string): boolean =>
  Boolean(semver.valid(candidate) && semver.valid(current) && semver.gt(candidate, current));

export async function verifyInstaller(file: string, version: string, current: string): Promise<void> {
  if (!isNewerVersion(version, current)) throw new Error('Actualización anterior o inválida.');
  const publisher = process.env.CRISTI_UPDATE_CERT_SHA1;
  if (!publisher || !/^[a-f0-9]{40}$/i.test(publisher)) throw new Error('No hay certificado de publicación configurado.');
  const manifest = JSON.parse(await fs.readFile(file + '.json', 'utf8')) as { version: string; sha256: string };
  if (manifest.version !== version || !/^[a-f0-9]{64}$/i.test(manifest.sha256)) throw new Error('Manifiesto inválido.');
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  const hash = digest.digest('hex');
  if (hash !== manifest.sha256.toLowerCase()) throw new Error('Integridad del instalador inválida.');
  const result = await promisify(execFile)(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoProfile', '-NonInteractive', '-Command',
      "$s = Get-AuthenticodeSignature -LiteralPath $env:CRISTI_INSTALLER_PATH; if ($s.Status -ne 'Valid') { exit 1 }; $s.SignerCertificate.Thumbprint"],
    { windowsHide: true, timeout: 15000, env: { ...process.env, CRISTI_INSTALLER_PATH: file } });
  if (result.stdout.trim().toLowerCase() !== publisher.toLowerCase()) throw new Error('Editor del instalador no autorizado.');
}
