'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/format';

const control =
  'w-full bg-paper border border-line-strong px-4 h-12 text-[15px] text-ink placeholder:text-muted/70 transition-colors duration-200 hover:border-graphite focus:border-ink focus:outline-none aria-[invalid=true]:border-danger';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  id: string;
  children: ReactNode;
  className?: string;
}

function FieldShell({ label, error, hint, required, id, children, className }: FieldShellProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[0.72rem] font-medium uppercase tracking-[0.16em] text-graphite">
        {label}
        {required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, error, hint, required, wrapperClassName, className, type, id: idProp, ...rest }, ref) {
  const auto = useId();
  const id = idProp ?? auto;
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} id={id} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={isPassword && show ? 'text' : type}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={cn(control, isPassword && 'pr-12', className)}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-ink"
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </FieldShell>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, required, wrapperClassName, className, options, id: idProp, ...rest }, ref) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} id={id} className={wrapperClassName}>
      <select ref={ref} id={id} required={required} aria-invalid={error ? true : undefined} className={cn(control, 'appearance-none bg-[length:12px] bg-[right_1rem_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%2344403c' fill='none' stroke-width='1.5'/%3E%3C/svg%3E\")" }} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, error, hint, required, wrapperClassName, className, id: idProp, ...rest }, ref) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <FieldShell label={label} error={error} hint={hint} required={required} id={id} className={wrapperClassName}>
      <textarea ref={ref} id={id} required={required} aria-invalid={error ? true : undefined} className={cn(control, 'h-auto min-h-28 py-3 leading-relaxed', className)} {...rest} />
    </FieldShell>
  );
});

export function Checkbox({ label, checked, onChange, id: idProp }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  const auto = useId();
  const id = idProp ?? auto;
  return (
    <label htmlFor={id} className="inline-flex min-h-6 items-center gap-3 text-[15px] text-graphite">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-[18px] w-[18px] accent-[var(--color-charcoal)]" />
      <span>{label}</span>
    </label>
  );
}

export function fieldErrors(fields?: { path: string; message: string }[]) {
  const out: Record<string, string> = {};
  for (const f of fields ?? []) if (!out[f.path]) out[f.path] = f.message;
  return out;
}
