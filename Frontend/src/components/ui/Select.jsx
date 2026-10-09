export function Select({ id, error, className = '', children, ...rest }) {
  return (
    <select
      id={id}
      className={`sl-select${error ? ' sl-select--error' : ''} ${className}`.trim()}
      {...rest}
    >
      {children}
    </select>
  )
}
