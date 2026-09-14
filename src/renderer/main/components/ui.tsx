import type { ReactNode } from 'react'

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-6 w-6 rounded-full border-2 border-white/15 border-t-accent ${className}`}
      style={{ animation: 'spin 0.8s linear infinite' }}
    />
  )
}

export function Loading() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Spinner />
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-6 rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
      <div className="font-semibold">Something went wrong</div>
      <div className="mt-1 text-red-200/80">{message}</div>
      {onRetry && (
        <button className="mt-3 rounded-md bg-white/10 px-3 py-1 text-ink hover:bg-white/15" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      {action}
    </div>
  )
}

export function PageTitle({
  eyebrow,
  title,
  subtitle,
  cover,
  actions
}: {
  eyebrow?: string
  title: string
  subtitle?: ReactNode
  cover?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex items-end gap-6">
      {cover}
      <div className="min-w-0 flex-1">
        {eyebrow && <div className="text-xs font-semibold uppercase tracking-wider text-ink-2">{eyebrow}</div>}
        <h1 className="mt-1 truncate text-4xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-2 text-sm text-ink-2">{subtitle}</div>}
        {actions && <div className="mt-4 flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  disabled
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-black transition hover:brightness-110 active:brightness-95 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

export function GhostButton({
  children,
  onClick,
  disabled,
  active,
  title
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition disabled:opacity-40 ${
        active ? 'border-accent/60 bg-accent/15 text-accent' : 'border-white/15 text-ink hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-sm text-ink-3">{children}</div>
}
