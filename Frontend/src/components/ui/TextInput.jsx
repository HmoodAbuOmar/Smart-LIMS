export function TextInput({ id, error, className = '', ...rest }) {
  return (
    <input
      id={id}
      className={`sl-input${error ? ' sl-input--error' : ''} ${className}`.trim()}
      {...rest}
    />
  )
}
