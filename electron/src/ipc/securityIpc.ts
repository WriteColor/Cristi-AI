import { handleTrusted } from '../security/CapabilityRouter';
import { credentialVault } from '../security/CredentialVault';
import { issueLiveToken } from '../security/LiveTokenBroker';
import { readPublicConfig } from '../security/PublicConfig';

export function registerSecurityIpc(): void {
  handleTrusted('secure-set-secret', async (_event, key, value) => {
    await credentialVault.set(key, value);
    if (key === 'spotify.clientSecret') await credentialVault.delete('spotify.oauthToken');
    return { success: true };
  });
  handleTrusted('secure-delete-secret', async (_event, key) => { await credentialVault.delete(key); return { success: true }; });
  handleTrusted('credential-status', async () => { await readPublicConfig(); return credentialVault.status(); });
  handleTrusted('live-token', async (_event, model) => { await readPublicConfig(); return issueLiveToken(model); });
  handleTrusted('gemini-generate', async (_event, model, body) => {
    const key = await credentialVault.get('gemini.apiKey');
    if (!key) throw new Error('Credencial Gemini no configurada.');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(30000), body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Gemini devolvió ${response.status}.`);
    return response.json();
  });
}
