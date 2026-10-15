export function Button({
  variant = 'primary',
  size,
  block,
  className = '',
  type = 'button',
  children,
  ...rest
}) {
  const classes = [
    'sl-btn',
    `sl-btn--${variant}`,
    size === 'sm' ? 'sl-btn--sm' : '',
    block ? 'sl-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type={type} className={classes} {...rest}>
      {children}
    </button>
  )
}
