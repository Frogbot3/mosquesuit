import { vi } from 'vitest';
import { securityChannels,type SecurityApi } from '../../shared/security';
export function securityApiMocks(){return Object.fromEntries(Object.keys(securityChannels).map(k=>[k,vi.fn()])) as unknown as SecurityApi;}
