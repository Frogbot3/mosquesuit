import { createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';

const envelopeSchema = z.object({ payload: z.string().min(1).max(60000).regex(/^[A-Za-z0-9+/]+={0,2}$/), signature: z.string().regex(/^[A-Za-z0-9+/]{86}==$/) }).strict();
const version = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-rc\.(0|[1-9]\d*))?$/);
export function compareVersions(a: string, b: string): number {
  version.parse(a); version.parse(b);
  const parts = (v: string) => { const [core, rc] = v.split('-rc.'); return [...core.split('.').map(BigInt), rc === undefined ? null : BigInt(rc)]; };
  const left = parts(a), right = parts(b);
  for (let i = 0; i < 4; i++) { if (left[i] === right[i]) continue; if (left[i] === null) return 1; if (right[i] === null) return -1; return left[i]! > right[i]! ? 1 : -1; }
  return 0;
}
export function signedPayload(input: unknown, publicKey: string): unknown {
  if (!publicKey) throw new Error('TRUST_NOT_CONFIGURED');
  const envelope = envelopeSchema.parse(input), key = createPublicKey(publicKey);
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (key.asymmetricKeyType !== 'ed25519' || !verify(null, bytes, key, Buffer.from(envelope.signature, 'base64'))) throw new Error('SIGNATURE_INVALID');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
const manifestSchema = z.object({ product: z.literal('Mosque Suite'), version, schemaVersion: z.number().int().positive(), publishedAt: z.iso.datetime(), expiresAt: z.iso.datetime(), notes: z.string().max(4000), installerUrl: z.url(), sha512: z.string().regex(/^[a-f0-9]{128}$/), size: z.number().int().min(1).max(1024 * 1024 * 1024), publisher: z.string().min(1).max(200) }).strict();
export function verifiedManifest(envelope: unknown, config: { releasePublicKey: string; manifestUrl: string; publisher: string }, currentVersion: string, schemaVersion: number, now = Date.now()) {
  const result = manifestSchema.parse(signedPayload(envelope, config.releasePublicKey));
  const source = new URL(config.manifestUrl), asset = new URL(result.installerUrl);
  if (source.protocol !== 'https:' || source.username || source.password || asset.origin !== source.origin || asset.username || asset.password || result.publisher !== config.publisher || !config.publisher) throw new Error('UPDATE_ORIGIN');
  if (Date.parse(result.publishedAt) > now + 300000 || Date.parse(result.expiresAt) <= now || Date.parse(result.expiresAt) <= Date.parse(result.publishedAt)) throw new Error('UPDATE_EXPIRED');
  if (compareVersions(result.version, currentVersion) < 0 || result.schemaVersion < schemaVersion) throw new Error('UPDATE_DOWNGRADE');
  return result;
}
export const licenseSchema = z.object({ product: z.literal('Mosque Suite'), licenseId: z.uuid(), customerReference: z.string().min(1).max(100), workspaceId: z.uuid(), edition: z.literal('Licensed'), issuedAt: z.iso.datetime(), expiresAt: z.iso.datetime().nullable(), features: z.array(z.string().max(80)).max(32) }).strict();
export function verifiedLicense(envelope: unknown, publicKey: string, workspaceId: string, now = Date.now()) {
  const value = licenseSchema.parse(signedPayload(envelope, publicKey));
  if (value.workspaceId !== workspaceId || Date.parse(value.issuedAt) > now + 300000) throw new Error('LICENSE_MISMATCH');
  return { value, status: value.expiresAt && Date.parse(value.expiresAt) <= now ? 'expired' : 'active' };
}
