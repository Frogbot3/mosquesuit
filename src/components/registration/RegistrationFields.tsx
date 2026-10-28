import { useId } from 'react';
import { useFormContext, useFormState, type FieldPath } from 'react-hook-form';
import { todayInIndia, type FamilyDraft } from '../../../shared/registration';
import { isRegistrationKey, useRegistrationText, type RegistrationKey } from '../../lib/registration-i18n';

export function RegistrationField({ name, label, required = false, type = 'text', maxLength, wide = false, help, options, rows, lang }: {
  name: FieldPath<FamilyDraft>; label: RegistrationKey; required?: boolean; type?: string; maxLength?: number; wide?: boolean;
  help?: RegistrationKey; options?: { value: string; label: string }[]; rows?: number; lang?: string;
}) {
  const r = useRegistrationText(); const id = useId();
  const { register, control, getFieldState } = useFormContext<FamilyDraft>();
  const state = useFormState({ control, name }); const { error } = getFieldState(name, state);
  const describedBy = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  const attributes = { id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy, 'aria-required': required || undefined, lang };
  return <div className={`field ${wide ? 'full' : ''}`}>
    <label htmlFor={id}>{r(label)}{required && <span aria-hidden="true" className="required"> *</span>}</label>
    {options ? <select {...attributes} {...register(name)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      : rows ? <textarea {...attributes} rows={rows} maxLength={maxLength} {...register(name)} />
        : <input {...attributes} type={type} maxLength={maxLength} min={type === 'date' ? '1800-01-01' : undefined} max={type === 'date' ? todayInIndia() : undefined} {...register(name)} />}
    {help && <small className="field-help" id={`${id}-help`}>{r(help)}</small>}
    {error && <span className="field-error" id={`${id}-error`} role="alert">{r(error.message && isRegistrationKey(error.message) ? error.message : 'invalid')}</span>}
  </div>;
}
