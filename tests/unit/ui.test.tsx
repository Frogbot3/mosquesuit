import { securityApiMocks } from '../fixtures/security-api';
import { integrationMocks } from '../fixtures/integrations-api';
// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider } from '../../src/components/WorkspaceProvider';
import { SettingsPage } from '../../src/pages/Settings';
import { Wards } from '../../src/pages/Wards';
import type { Settings, Snapshot } from '../../shared/contracts';
import { lifeApiMocks } from '../fixtures/life-api';
import { financeApiMocks } from '../fixtures/finance-api';

const fixture: Snapshot = {
  settings: { name: 'Demo Mosque', nameMl: 'മാതൃകാ പള്ളി', address: '', contact: '', locale: 'en', theme: 'light', revision: 0 },
  wards: [{ id: '1', code: 'W1', name: 'Ward 1', nameMl: 'വാർഡ് 1', active: true }, { id: '2', code: 'W2', name: 'Ward 2', nameMl: 'വാർഡ് 2', active: true }],
  activity: [], environment: 'test', version: '0.5.0', canResetDemo: true, schemaVersion: 5, registryCounts: { families: 0, livingMembers: 0 }, lifeEventsDemo: false,financeDemo:false,integrationsDemo:false,
};
function setup(page: 'wards' | 'settings') {
  window.mosque = {
    ...lifeApiMocks(),...financeApiMocks(),...integrationMocks(),...securityApiMocks(),
    getSnapshot: vi.fn().mockResolvedValue({ ok: true, data: structuredClone(fixture) }),
    saveSettings: vi.fn(async (settings: Settings) => ({ ok: true as const, data: { ...settings, revision: settings.revision + 1 } })),
    checkStorage: vi.fn().mockResolvedValue({ ok: true, data: { integrity: 'ok', schemaVersion: 2, foreignKeys: true, journalMode: 'wal' } }),
    resetDemo: vi.fn().mockResolvedValue({ ok: true, data: null }),
    listFamilies: vi.fn(), getFamily: vi.fn(), saveFamily: vi.fn(), listMembers: vi.fn(), getMember: vi.fn(),
  };
  const router = createMemoryRouter([{ path: '/', element: <WorkspaceProvider>{page === 'wards' ? <Wards /> : <SettingsPage />}</WorkspaceProvider> }]);
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}
describe('workspace UI', () => {
  it('filters wards using Malayalam and provides a working empty-state reset', async () => {
    const user = setup('wards'); const input = await screen.findByRole('searchbox', { name: 'Search wards' });
    await user.type(input, 'വാർഡ് 2'); expect(screen.queryByText('Ward 1')).not.toBeInTheDocument(); expect(screen.getByText('Ward 2')).toBeInTheDocument();
    await user.clear(input); await user.type(input, 'missing'); expect(screen.getByText('No matching wards')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' })); expect(screen.getByText('Ward 1')).toBeInTheDocument();
  });
  it('blocks invalid forms and persists a valid profile', async () => {
    const user = setup('settings'); const name = await screen.findByLabelText(/Mosque name \(English\)/);
    await user.clear(name); await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Enter at least 2 characters.')).toBeInTheDocument(); expect(window.mosque!.saveSettings).not.toHaveBeenCalled();
    await user.type(name, 'Fictional Crescent Mosque'); await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(window.mosque!.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ name: 'Fictional Crescent Mosque' })));
    expect(await screen.findByText('Settings saved on this computer.')).toBeInTheDocument();
  });
  it('keeps failed saves visible without claiming success', async () => {
    const user = setup('settings'); window.mosque!.saveSettings = vi.fn().mockResolvedValue({ ok: false, error: { code: 'STORAGE', message: 'Storage is unavailable.' } });
    const name = await screen.findByLabelText(/Mosque name \(English\)/); await user.clear(name); await user.type(name, 'Unsaved test');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Storage is unavailable.')).toBeInTheDocument(); expect(screen.queryByText('Settings saved on this computer.')).not.toBeInTheDocument();
    expect(name).toHaveValue('Unsaved test');
  });
});
