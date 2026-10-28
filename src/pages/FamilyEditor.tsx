import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormProvider, useFieldArray, useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { blankMember, profileToDraft, saveFamilySchema, todayInIndia, type FamilyDraft, type FamilyProfile } from '../../shared/registration';
import { useWorkspace } from '../components/WorkspaceProvider';
import { PageHeading } from '../components/Primitives';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RegistryState } from '../components/registration/RegistryShared';
import { RegistrationField } from '../components/registration/RegistrationFields';
import { MemberEditor } from '../components/registration/MemberEditor';
import { desktop, unwrap, ApiError } from '../lib/api';
import { isRegistrationKey, useRegistrationText } from '../lib/registration-i18n';
import { useRegistrationData } from '../lib/useRegistrationData';
import { useUnsavedRegistration } from '../lib/useUnsavedRegistration';

export function FamilyEditor() {
  const { id } = useParams();
  const load = useCallback(() => id ? unwrap(desktop().getFamily({ id })) : Promise.resolve(null), [id]);
  const result = useRegistrationData(load);
  if (id && (result.loading || !result.data || result.data.id !== id)) return <RegistryState error={result.error} loading={result.loading} retry={result.retry} />;
  return <FamilyForm key={`${id ?? 'new'}-${result.data?.revision ?? 0}`} profile={id ? result.data : null} onReload={result.retry} />;
}

function FamilyForm({ profile, onReload }: { profile: FamilyProfile | null; onReload: () => void }) {
  const { snapshot, notify, refresh } = useWorkspace(); const r = useRegistrationText(); const navigate = useNavigate();
  const [params] = useSearchParams();
  const initial = useMemo<FamilyDraft>(() => {
    if (profile) return profileToDraft(profile);
    const guardian = blankMember(true);
    return { id: null, revision: 0, wardId: snapshot.wards.find(ward => ward.active)?.id ?? '', familyNumber: '', houseName: '', houseNameMl: '', houseNumber: '', address: '', locality: '', postalCode: '', email: '', registrationDate: todayInIndia(), notes: '', status: 'draft', guardianKey: guardian.clientKey, members: [guardian] };
  }, [profile, snapshot.wards]);
  const form = useForm<FamilyDraft>({ resolver: zodResolver(saveFamilySchema), defaultValues: initial, shouldFocusError: true });
  const { fields, append, remove, move } = useFieldArray({ control: form.control, name: 'members', keyName: 'formKey' });
  const members = useWatch({ control: form.control, name: 'members' });
  const guardianKey = useWatch({ control: form.control, name: 'guardianKey' });
  const { isDirty, isSubmitting, errors } = form.formState;
  const { blocker, allowNavigation } = useUnsavedRegistration(isDirty);
  const [openMembers, setOpenMembers] = useState(new Set([params.get('member') ?? initial.guardianKey]));
  const [removeKey, setRemoveKey] = useState<string | null>(null);
  const [guardianChange, setGuardianChange] = useState<string | null>(null);
  const [showReload, setShowReload] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const deceasedIds = useMemo(() => new Set(profile?.members.filter(member => member.lifeStatus === 'deceased').map(member => member.id) ?? []), [profile]);
  const living = members.filter(member => !member.id || !deceasedIds.has(member.id));
  const toggle = (key: string) => setOpenMembers(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  async function submit(draft: FamilyDraft) {
    setSaveError(null);
    try {
      const saved = await unwrap(desktop().saveFamily(draft));
      form.reset(profileToDraft(saved)); allowNavigation(); notify(r('saved'));
      navigate(`/families/${saved.id}`, { replace: true });
      void refresh().catch(() => { /* The registration already committed; do not report it as failed. */ });
    } catch (error) { setSaveError(error instanceof ApiError ? error.code : 'STORAGE'); }
  }
  function invalid(invalidFields: FieldErrors<FamilyDraft>) {
    const affected = form.getValues('members').filter((_member, index) => Boolean(invalidFields.members?.[index])).map(member => member.clientKey);
    setOpenMembers(previous => new Set([...previous, ...affected]));
  }
  function confirmGuardian() {
    const currentMembers = form.getValues('members');
    const nextIndex = currentMembers.findIndex(member => member.clientKey === guardianChange);
    const priorIndex = currentMembers.findIndex(member => member.clientKey === form.getValues('guardianKey'));
    if (nextIndex >= 0 && priorIndex >= 0) {
      form.setValue(`members.${priorIndex}.relationship`, 'unknown', { shouldDirty: true });
      form.setValue(`members.${nextIndex}.relationship`, 'guardian', { shouldDirty: true });
      form.setValue('guardianKey', currentMembers[nextIndex].clientKey, { shouldDirty: true });
      setOpenMembers(previous => new Set([...previous, currentMembers[nextIndex].clientKey]));
      move(nextIndex, 0);
    }
    setGuardianChange(null);
  }
  return <>
    <Link className="back-link" to={profile ? `/families/${profile.id}` : '/families'}><ArrowLeft size={17} />{r(profile ? 'viewFamily' : 'backFamilies')}</Link>
    <PageHeading title={r(profile ? 'editFamily' : 'newFamily')} description={r('familyFormSub')} />
    <FormProvider {...form}><form className="family-registration" onSubmit={form.handleSubmit(submit, invalid)} noValidate>
      <fieldset disabled={isSubmitting} className="registration-fieldset">
        <section className="panel"><h2>{r('familyDetails')}</h2><p className="section-description muted">{r('familyDetailsHelp')}</p>
          <div className="registration-grid">
            <RegistrationField name="wardId" label="wardId" required options={[{ value: '', label: r('wardRequired') }, ...snapshot.wards.filter(ward => ward.active || ward.id === initial.wardId).map(ward => ({ value: ward.id, label: snapshot.settings.locale === 'ml' ? ward.nameMl || ward.name : ward.name }))]} />
            <RegistrationField name="familyNumber" label="familyNumber" required maxLength={24} help="familyNumberHelp" />
            <RegistrationField name="houseNumber" label="houseNumber" maxLength={60} />
            <RegistrationField name="houseName" label="houseName" maxLength={150} lang="en" />
            <RegistrationField name="houseNameMl" label="houseNameMl" maxLength={150} lang="ml" />
            <RegistrationField name="registrationDate" label="registrationDate" type="date" />
            <RegistrationField name="address" label="address" rows={2} maxLength={500} wide />
            <RegistrationField name="locality" label="locality" maxLength={150} />
            <RegistrationField name="postalCode" label="postalCode" maxLength={6} />
            <RegistrationField name="email" label="email" type="email" maxLength={254} />
            <RegistrationField name="status" label="status" options={(['draft', 'registered'] as const).map(value => ({ value, label: r(value) }))} />
            <RegistrationField name="notes" label="notes" rows={2} maxLength={2000} wide />
          </div>
        </section>
        <section className="registration-members"><div className="section-heading"><div><h2>{r('householdMembers')}</h2><p>{r('membersHelp')}</p></div><button className="button secondary" type="button" disabled={members.length >= 50} onClick={() => { const member = blankMember(); append(member, { shouldFocus: false }); setOpenMembers(previous => new Set([...previous, member.clientKey])); }}><Plus size={18} />{r('addMember')}</button></div>
          <div className="registration-counts" aria-live="polite"><strong>{r('livingMembers')}: {living.length}</strong><span>{r('maleMembers')}: {living.filter(member => member.gender === 'male').length}</span><span>{r('femaleMembers')}: {living.filter(member => member.gender === 'female').length}</span><span>{r('otherUnknown')}: {living.filter(member => member.gender === 'unknown' || member.gender === 'other').length}</span></div>
          {fields.map((field, index) => <MemberEditor key={field.formKey} index={index} open={openMembers.has(field.clientKey)} guardian={field.clientKey === guardianKey} deceased={Boolean(field.id && deceasedIds.has(field.id))} onToggle={() => toggle(field.clientKey)} onRemove={() => setRemoveKey(field.clientKey)} onGuardian={() => setGuardianChange(field.clientKey)} />)}
          <p className="field-help registration-note">{r('retainedNote')}</p>
        </section>
      </fieldset>
      {Object.keys(errors).length > 0 && <div className="form-error" role="alert">{r('validationHeading')}</div>}
      {saveError && <div className="form-error" role="alert"><p>{r(isRegistrationKey(saveError) ? saveError : 'STORAGE')}</p>{profile && <button className="text-link" type="button" onClick={() => setShowReload(true)}>{r('reloadSaved')}</button>}</div>}
      <div className="registration-savebar"><span className="muted" role="status">{isDirty ? r('unsaved') : r('requiredNote')}</span><button className="button secondary" type="button" disabled={isSubmitting} onClick={() => navigate(profile ? `/families/${profile.id}` : '/families')}>{r('cancel')}</button><button className="button primary" type="submit" disabled={isSubmitting || Boolean(profile && !isDirty)}><Save size={18} />{r(isSubmitting ? 'saving' : profile ? 'saveChanges' : 'saveFamily')}</button></div>
    </form></FormProvider>
    <ConfirmDialog open={blocker.state === 'blocked'} title={r('discardTitle')} confirm={r('discardLeave')} cancel={r('keepEditing')} busy={isSubmitting} onConfirm={() => { if (blocker.state === 'blocked') blocker.proceed(); }} onCancel={() => { if (blocker.state === 'blocked') blocker.reset(); }}>{r('discardDescription')}</ConfirmDialog>
    <ConfirmDialog open={Boolean(removeKey)} title={r('removeTitle')} confirm={r('removeMember')} cancel={r('cancel')} onConfirm={() => { const index = form.getValues('members').findIndex(member => member.clientKey === removeKey); if (index >= 0 && removeKey !== form.getValues('guardianKey')) remove(index); setRemoveKey(null); }} onCancel={() => setRemoveKey(null)}>{r('removeDescription')}</ConfirmDialog>
    <ConfirmDialog open={Boolean(guardianChange)} title={r('changeGuardianTitle')} confirm={r('confirmGuardian')} cancel={r('cancel')} onConfirm={confirmGuardian} onCancel={() => setGuardianChange(null)}>{r('changeGuardianDescription')}</ConfirmDialog>
    <ConfirmDialog open={showReload} title={r('reloadTitle')} confirm={r('reloadSaved')} cancel={r('keepEditing')} onConfirm={() => { setShowReload(false); onReload(); }} onCancel={() => setShowReload(false)}>{r('reloadDescription')}</ConfirmDialog>
  </>;
}
