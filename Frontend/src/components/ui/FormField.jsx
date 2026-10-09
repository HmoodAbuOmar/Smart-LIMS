export function FormField({
  id,
  label,
  required,
  error,
  hint,
  children,
}) {
  return (
    <div className="sl-field">
      {label ? (
        <label
          className={`sl-label${required ? ' sl-label--required' : ''}`}
          htmlFor={id}
        >
          {label}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="sl-field-error" role="alert">
          {error}
        </span>
      ) : null}
      {hint && !error ? (
        <span className="sl-field-error" style={{ color: 'var(--sl-text-muted)' }}>
          {hint}
        </span>
      ) : null}
    </div>
  )
}
