import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const signed = process.argv.includes('--signed');
const policy = JSON.parse(await readFile('release-policy.json', 'utf8'));
if (signed) {
  // No production assertion can be inferred from an unsigned local build.
  if (!policy.publisher || !policy.supportEmail || !policy.manifestUrl.startsWith('https://') || !policy.releasePublicKey) throw new Error('Production publisher, support contact and pinned update trust are required.');
  throw new Error('Production release remains blocked pending independent security, Windows install/upgrade/recovery and legal acceptance. Use the unsigned testing candidate.');
}
if (policy.channel !== 'unsigned-testing') throw new Error('Only an explicitly labeled testing channel can be packaged by this workflow.');
for (const [script, args] of [['scripts/build-electron.mjs', ['--release']], ['scripts/verify-native.mjs', []]]) {
  const result = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit', windowsHide: true }); if (result.status !== 0) process.exit(result.status ?? 1);
}
const main = await readFile('dist-electron/main.cjs', 'utf8');
for (const marker of ['createMockIntegrationClient', 'integration-service.sqlite3', 'MOCK_SERVICE_SECRET']) {
  // Backup archive support names the integration DB for old profile recovery; only
  // executable mock service code must be absent from this release bundle.
  if (marker !== 'integration-service.sqlite3' && main.includes(marker)) throw new Error(`Development service found: ${marker}`);
}
await mkdir('tmp', { recursive: true });
await writeFile('tmp/release-build-kind.json', JSON.stringify({ channel: policy.channel, signed: false, builtAt: new Date().toISOString(), mockServiceIncluded: false }, null, 2));
console.log('Unsigned testing main/preload prepared; mock service excluded. No signing claim.');
