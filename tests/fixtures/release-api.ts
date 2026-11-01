import { vi } from 'vitest';
import { releaseChannels, type ReleaseApi } from '../../shared/release';
export function releaseApiMocks() { return Object.fromEntries(Object.keys(releaseChannels).map(k => [k, vi.fn()])) as unknown as ReleaseApi; }
