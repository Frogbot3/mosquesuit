import { app, BrowserWindow, dialog, type BrowserWindow as Window } from 'electron';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FamilyProfile } from '../shared/registration';
import type { Settings } from '../shared/contracts';
import type { WorkspaceStore } from './database/store';
import { printDocuments } from './event-output';
import { releaseText } from '../shared/release-labels';
import { atomicPrivateFile, externalDestination } from './secure-files';
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function familyPaper(family: FamilyProfile, settings: Settings, logo: string, css: string) {
  const t = (k: string) => `${releaseText('en', k)} / ${releaseText('ml', k)}`;
  const members = family.members.filter(m => !m.archivedAt).sort((a, b) => Number(b.id === family.guardianMemberId) - Number(a.id === family.guardianMemberId));
  return `<!doctype html><html class="event-paper-root" lang="${settings.locale}"><head><meta charset="utf-8"><title>${escape(t('familyForm'))}</title><link rel="stylesheet" href="${escape(css)}"></head><body class="event-paper"><header><p class="paper-demo">${escape(t('fictional'))}</p>${logo ? `<img class="paper-logo" src="${escape(logo)}" alt="">` : ''}<h1>${escape(settings.name)}<br><span lang="ml">${escape(settings.nameMl)}</span></h1><p>${escape(settings.address)} · ${escape(settings.contact)}</p><h2>${escape(t('familyForm'))}</h2></header><p>${escape(family.familyCode)} · ${escape(family.wardName)} / ${escape(family.wardNameMl)}</p><p>${escape(family.houseName)} / ${escape(family.houseNameMl)} · ${escape(family.houseNumber)}</p><p>${escape(family.address)} · ${escape(family.locality)} · ${escape(family.postalCode)}</p><table><thead><tr>${['member', 'relationship', 'dob', 'phone'].map(k => `<th>${escape(t(k))}</th>`).join('')}</tr></thead><tbody>${members.map(m => `<tr><td>${escape(m.name)}<br><span lang="ml">${escape(m.nameMl)}</span>${m.lifeStatus === 'deceased' ? `<br>${escape(t('deceased'))}` : ''}</td><td>${escape(t(m.relationship))}</td><td>${escape(m.dob)}</td><td>${escape(m.phone)}</td></tr>`).join('')}</tbody></table><footer><p>${escape(t('administrative'))}</p></footer></body></html>`;
}
export async function outputFamily(window: Window, store: WorkspaceStore, rendererRoot: string, input: { id: string; format: 'pdf' | 'print' }) {
  store.security.require('data.export'); const family = store.registration.get({ id: input.id });
  const settings = store.getSettings(), logo = (store.security.db.prepare('SELECT logo FROM finance_settings WHERE id=1').get() as { logo: string }).logo;
  const css = (await readdir(join(rendererRoot, 'assets'))).find(f => /^index-.*\.css$/.test(f)); if (!css) throw new Error('Build assets required');
  let destination: string | undefined;
  if (input.format === 'pdf') { const picked = await dialog.showSaveDialog(window, { title: releaseText(settings.locale, 'pdf'), defaultPath: `Testing-Family-${family.familyNumber.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }); if (picked.canceled || !picked.filePath) return false; destination = await externalDestination(picked.filePath, app.getPath('userData')); }
  store.security.require('data.export'); store.registration.get({ id: input.id });
  const token = `/print/${randomUUID()}`; printDocuments.set(token, familyPaper(family, settings, logo, `app://mosque/assets/${css}`));
  const paper = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, devTools: false } });
  paper.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); paper.webContents.on('will-navigate', e => e.preventDefault());
  try {
    await paper.loadURL(`app://mosque${token}`); await paper.webContents.executeJavaScript('Promise.all([document.fonts.ready,...Array.from(document.images).map(i=>i.decode())]).then(()=>true)');
    if (destination) { const pdf = await paper.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true }); store.security.require('data.export'); store.registration.get({ id: input.id }); await atomicPrivateFile(destination, pdf); }
    else { store.security.require('data.export'); store.registration.get({ id: input.id }); await new Promise<void>((resolve, reject) => paper.webContents.print({ silent: false, printBackground: true }, (ok, reason) => ok ? resolve() : reject(new Error(reason)))); }
    store.security.audit('export.family', 'family', input.id); return true;
  } finally { printDocuments.delete(token); paper.destroy(); }
}
