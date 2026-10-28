import { useFormContext, useWatch } from 'react-hook-form';
import { ChevronDown, ChevronUp, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { bloodGroups, calculateAge, genders, maritalStatuses, relationships, type FamilyDraft } from '../../../shared/registration';
import { useRegistrationText } from '../../lib/registration-i18n';
import { RegistrationField } from './RegistrationFields';
import { useWorkspace } from '../WorkspaceProvider';

export function MemberEditor({ index, open, guardian, deceased, onToggle, onRemove, onGuardian }: {
  index: number; open: boolean; guardian: boolean; deceased: boolean; onToggle: () => void; onRemove: () => void; onGuardian: () => void;
}) {
  const r = useRegistrationText(); const { control } = useFormContext<FamilyDraft>(); const { snapshot } = useWorkspace();
  const member = useWatch({ control, name: `members.${index}` });
  const name = (snapshot.settings.locale === 'ml' ? member.nameMl || member.name : member.name || member.nameMl) || `${r('member')} ${index + 1}`;
  const age = calculateAge(member.dob);
  const prefix = `members.${index}` as const;
  return <section className={`member-editor ${guardian ? 'guardian-editor' : ''}`} aria-label={`${r('member')} ${index + 1}`}>
    <header className="member-editor-header"><span className="member-avatar">{guardian ? <ShieldCheck size={22} /> : <UserRound size={22} />}</span><div><h3>{name}</h3><p>{guardian ? r('guardian') : r(member.relationship)}<span aria-hidden="true"> · </span>{age === null ? r('unknownAge') : `${age} ${r('years')}`}{deceased && ` · ${r('deceased')}`}</p></div>
      <button className="button secondary" type="button" aria-expanded={open} aria-controls={`member-fields-${member.clientKey}`} onClick={onToggle}>{open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}{r(open ? 'hideDetails' : 'editDetails')}</button>
    </header>
    <div id={`member-fields-${member.clientKey}`} hidden={!open} className="member-editor-body">
      <div className="registration-grid">
        <RegistrationField name={`${prefix}.name`} label="name" maxLength={150} help="nameHelp" lang="en" />
        <RegistrationField name={`${prefix}.nameMl`} label="nameMl" maxLength={150} lang="ml" />
        <RegistrationField name={`${prefix}.relationship`} label="relationship" options={(guardian ? ['guardian' as const] : relationships.filter(value => value !== 'guardian')).map(value => ({ value, label: r(value) }))} />
        <RegistrationField name={`${prefix}.gender`} label="gender" options={genders.map(value => ({ value, label: r(value) }))} />
        <RegistrationField name={`${prefix}.dob`} label="dob" type="date" />
        <div className="field age-field"><span>{r('age')}</span><output>{age === null ? r('unknownAge') : `${age} ${r('years')}`}</output></div>
        <RegistrationField name={`${prefix}.fatherName`} label="fatherName" maxLength={150} />
        <RegistrationField name={`${prefix}.motherName`} label="motherName" maxLength={150} />
        <RegistrationField name={`${prefix}.maritalStatus`} label="maritalStatus" options={maritalStatuses.map(value => ({ value, label: r(value) }))} />
        <RegistrationField name={`${prefix}.education`} label="education" maxLength={150} />
        <RegistrationField name={`${prefix}.occupation`} label="occupation" maxLength={150} />
        <RegistrationField name={`${prefix}.bloodGroup`} label="bloodGroup" options={bloodGroups.map(value => ({ value, label: value && value !== 'unknown' ? value : r('notRecorded') }))} />
        <RegistrationField name={`${prefix}.phone`} label="phone" type="tel" maxLength={30} />
        <RegistrationField name={`${prefix}.remarks`} label="remarks" rows={2} maxLength={1000} wide />
      </div>
      <div className="member-row-actions">{guardian ? <p className="field-help">{r('guardianHelp')}</p> : <button type="button" className="button secondary" disabled={deceased} onClick={onGuardian}><ShieldCheck size={17} />{r('makeGuardian')}</button>}
        <button type="button" className="button secondary danger-text" disabled={guardian} aria-label={`${r('removeMember')} ${index + 1}`} onClick={onRemove}><Trash2 size={17} />{r('removeMember')}</button>
      </div>
    </div>
  </section>;
}
