'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface FieldBaseProps {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  required?: boolean;
  className?: string;
}

export type TextFieldProps = FieldBaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'>;
export type SelectFieldProps = FieldBaseProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'required'> & { children: ReactNode };
export type TextareaFieldProps = FieldBaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'required'>;

/** Label, control, hint and validation message are wired together for assistive technology. */
export function TextField({ label, hint, error, id, required, className = '', 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props }: TextFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = hint || error ? `${controlId}-description` : undefined;

  return (
    <div className={['jn-field', className].filter(Boolean).join(' ')}>
      <label className="jn-field__label" htmlFor={controlId}>
        {label}{required && <span className="jn-field__required" aria-hidden="true"> *</span>}
      </label>
      <input
        {...props}
        id={controlId}
        className={['jn-input', error && 'jn-input--error'].filter(Boolean).join(' ')}
        required={required}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={[descriptionId, describedBy].filter(Boolean).join(' ') || undefined}
      />
      {(hint || error) && (
        <p id={descriptionId} className={error ? 'jn-field__error' : 'jn-field__hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function SelectField({ label, hint, error, id, required, className = '', children, 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props }: SelectFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = hint || error ? `${controlId}-description` : undefined;

  return (
    <div className={['jn-field', className].filter(Boolean).join(' ')}>
      <label className="jn-field__label" htmlFor={controlId}>
        {label}{required && <span className="jn-field__required" aria-hidden="true"> *</span>}
      </label>
      <select
        {...props}
        id={controlId}
        className={['jn-input', 'jn-select', error && 'jn-input--error'].filter(Boolean).join(' ')}
        required={required}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={[descriptionId, describedBy].filter(Boolean).join(' ') || undefined}
      >
        {children}
      </select>
      {(hint || error) && (
        <p id={descriptionId} className={error ? 'jn-field__error' : 'jn-field__hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export function TextareaField({ label, hint, error, id, required, className = '', 'aria-describedby': describedBy, 'aria-invalid': ariaInvalid, ...props }: TextareaFieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const descriptionId = hint || error ? `${controlId}-description` : undefined;

  return (
    <div className={['jn-field', className].filter(Boolean).join(' ')}>
      <label className="jn-field__label" htmlFor={controlId}>
        {label}{required && <span className="jn-field__required" aria-hidden="true"> *</span>}
      </label>
      <textarea
        {...props}
        id={controlId}
        className={['jn-input', 'jn-textarea', error && 'jn-input--error'].filter(Boolean).join(' ')}
        required={required}
        aria-invalid={error ? true : ariaInvalid}
        aria-describedby={[descriptionId, describedBy].filter(Boolean).join(' ') || undefined}
      />
      {(hint || error) && (
        <p id={descriptionId} className={error ? 'jn-field__error' : 'jn-field__hint'}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
