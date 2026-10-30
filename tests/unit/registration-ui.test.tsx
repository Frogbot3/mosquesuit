import { securityApiMocks } from '../fixtures/security-api';
import { integrationMocks } from '../fixtures/integrations-api';
// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspaceProvider } from '../../src/components/WorkspaceProvider';
import { FamilyEditor } from '../../src/pages/FamilyEditor';
import type { Snapshot } from '../../shared/contracts';
import { lifeApiMocks } from '../fixtures/life-api';
import { financeApiMocks } from '../fixtures/finance-api';

function setup() {
  const snapshot: Snapshot = {
    settings: { name: 'Fictional Mosque', nameMl: '', address: '', contact: '', locale: 'en', theme: 'light', revision: 0 },
    wards: [{ id: 'ward-1', code: 'W1', name: 'Ward 1', nameMl: 'വാർഡ് 1', active: true }],
    activity: [], environment: 'test', version: '0.5.0', canResetDemo: true, schemaVersion: 5, registryCounts: { families: 0, livingMembers: 0 }, lifeEventsDemo: false,financeDemo:false,integrationsDemo:false,
  };
  window.mosque = {
    ...lifeApiMocks(),...financeApiMocks(),...integrationMocks(),...securityApiMocks(),
    getSnapshot: vi.fn().mockResolvedValue({ ok: true, data: snapshot }), saveSettings: vi.fn(), checkStorage: vi.fn(), resetDemo: vi.fn(),
    listFamilies: vi.fn(), getFamily: vi.fn(), listMembers: vi.fn(), getMember: vi.fn(),
    saveFamily: vi.fn().mockResolvedValue({ ok: false, error: { code: 'DUPLICATE_FAMILY', message: 'Duplicate' } }),
  };
  const router = createMemoryRouter([{ element: <WorkspaceProvider><Outlet /></WorkspaceProvider>, children: [
    { path: '/families/new', element: <FamilyEditor /> }, { path: '/families', element: <p>Family directory</p> },
  ] }], { initialEntries: ['/families/new'] });
  render(<RouterProvider router={router} />);
  return userEvent.setup();
}

describe('registration form', () => {
  it('requires a guardian name and rejects invalid phones before calling IPC', async () => {
    const user = setup(); await user.type(await screen.findByLabelText(/Family number/), '001');
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(await screen.findByText('Enter a name in English or Malayalam.')).toBeVisible();
    await user.type(screen.getByLabelText('Full name (English)'), 'Fictional Guardian');
    await user.type(screen.getByLabelText('Phone number'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(await screen.findByText('Use a phone number with 7–15 digits, or leave it blank.')).toBeVisible();
    expect(window.mosque!.saveFamily).not.toHaveBeenCalled();
  });
  it('accepts a partial Malayalam-only household and retains the draft after a duplicate response', async () => {
    const user = setup(); await user.type(await screen.findByLabelText(/Family number/), '001');
    await user.type(screen.getByLabelText('Full name (Malayalam)'), 'സാങ്കൽപ്പിക അമീൻ');
    expect(screen.getByRole('button', { name: 'Remove member 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(await screen.findByText('This family number already exists in that ward. Choose another number.')).toBeVisible();
    expect(window.mosque!.saveFamily).toHaveBeenCalledWith(expect.objectContaining({ familyNumber: '001', members: [expect.objectContaining({ name: '', nameMl: 'സാങ്കൽപ്പിക അമീൻ', dob: '' })] }));
    expect(screen.getByLabelText('Full name (Malayalam)')).toHaveValue('സാങ്കൽപ്പിക അമീൻ');
  });
  it('reopens a collapsed member with errors so the required correction is visible', async () => {
    const user = setup(); await user.type(await screen.findByLabelText(/Family number/), '001');
    await user.type(screen.getByLabelText('Full name (English)'), 'Fictional Guardian');
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    const second = within(screen.getByRole('region', { name: 'Member 2' }));
    await user.click(second.getByRole('button', { name: 'Close details' }));
    await user.click(screen.getByRole('button', { name: 'Save family' }));
    expect(await second.findByText('Enter a name in English or Malayalam.')).toBeVisible();
    expect(second.getByLabelText('Full name (English)')).toBeVisible();
    expect(window.mosque!.saveFamily).not.toHaveBeenCalled();
  });
});
