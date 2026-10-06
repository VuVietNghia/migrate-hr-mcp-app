import {
  useId,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';

type StudioTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(' ');
}

interface StudioPageProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function StudioPage({ className, children, ...props }: StudioPageProps) {
  return (
    <div className={classes('studio-page', className)} {...props}>
      {children}
    </div>
  );
}

interface StudioPageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function StudioPageHeader({
  className,
  eyebrow,
  title,
  description,
  actions,
  ...props
}: StudioPageHeaderProps) {
  return (
    <header className={classes('studio-page-header', className)} {...props}>
      <div className="studio-page-header__copy">
        {eyebrow ? <span className="studio-eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="studio-page-header__actions">{actions}</div> : null}
    </header>
  );
}

interface StudioCardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function StudioCard({
  className,
  title,
  description,
  actions,
  children,
  ...props
}: StudioCardProps) {
  return (
    <section className={classes('studio-card', className)} {...props}>
      {title || description || actions ? (
        <div className="studio-card__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="studio-card__actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className="studio-card__body">{children}</div>
    </section>
  );
}

interface StudioPrefixInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  prefix: ReactNode;
  wrapperClassName?: string;
}

export function StudioPrefixInput({
  prefix,
  wrapperClassName,
  className,
  ...inputProps
}: StudioPrefixInputProps) {
  return (
    <span className={classes('studio-prefix-input', wrapperClassName)}>
      <span className="studio-prefix-input__prefix" aria-hidden="true">
        {prefix}
      </span>
      <input className={className} {...inputProps} />
    </span>
  );
}

interface StudioSearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  label: string;
  wrapperClassName?: string;
}

export function StudioSearchInput({
  icon,
  label,
  wrapperClassName,
  className,
  ...inputProps
}: StudioSearchInputProps) {
  return (
    <label className={classes('studio-search-input', wrapperClassName)}>
      {icon ? <span className="studio-search-input__icon" aria-hidden="true">{icon}</span> : null}
      <span className="studio-sr-only">{label}</span>
      <input className={className} {...inputProps} />
    </label>
  );
}

interface StudioMessageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: StudioTone;
  title?: ReactNode;
  children: ReactNode;
}

export function StudioInlineState({
  className,
  tone = 'neutral',
  title,
  children,
  role,
  ...props
}: StudioMessageProps) {
  return (
    <div
      className={classes('studio-inline-state', `studio-inline-state--${tone}`, className)}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      {...props}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

export function StudioToast({
  className,
  tone = 'neutral',
  title,
  children,
  role,
  ...props
}: StudioMessageProps) {
  return (
    <div
      className={classes('studio-toast', `studio-toast--${tone}`, className)}
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      {...props}
    >
      {title ? <strong>{title}</strong> : null}
      <div>{children}</div>
    </div>
  );
}

interface StudioDialogProps extends Omit<HTMLAttributes<HTMLDialogElement>, 'title'> {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
}

export function StudioDialog({
  className,
  open,
  title,
  onClose,
  children,
  actions,
  ...props
}: StudioDialogProps) {
  const titleId = useId();

  if (!open) return null;

  return (
    <dialog
      className={classes('studio-dialog', className)}
      open
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      {...props}
    >
      <div className="studio-dialog__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="studio-icon-button" aria-label="Đóng" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="studio-dialog__body">{children}</div>
      {actions ? <div className="studio-dialog__actions">{actions}</div> : null}
    </dialog>
  );
}
