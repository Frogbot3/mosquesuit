import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { isTrustedDocument, resolveAsset } from '../../electron/security';

describe('trusted document policy', () => {
  it('allows only the local top-level entry document', () => {
    expect(isTrustedDocument('app://mosque/index.html#/settings', false)).toBe(true);
    expect(isTrustedDocument('http://127.0.0.1:5173/#/wards', true)).toBe(true);
    for (const url of ['https://evil.test', 'app://mosque.evil/index.html', 'app://evil@mosque/index.html', 'app://mosque/assets/fake.html', 'file:///index.html', 'http://127.0.0.1:5173/']) expect(isTrustedDocument(url, false)).toBe(false);
    expect(isTrustedDocument('http://localhost:5173/', true)).toBe(false);
    expect(isTrustedDocument('http://127.0.0.1:5173/frame', true)).toBe(false);
  });
  it('serves only packaged assets and rejects path escape attempts', () => {
    const root = resolve('fixture-renderer');
    expect(resolveAsset(root, 'app://mosque/index.html')).toBe(resolve(root, 'index.html'));
    expect(resolveAsset(root, 'app://mosque/assets/main.js')).toBe(resolve(root, 'assets/main.js'));
    for (const url of ['app://mosque/%2e%2e%2fsecret', 'app://mosque/assets/%2e%2e%5csecret', 'app://mosque/C:/Windows/file', 'app://other/index.html', 'app://mosque/package.json', 'app://mosque/%00', 'app://mosque/%ZZ']) expect(resolveAsset(root, url)).toBeNull();
  });
});
