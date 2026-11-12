import type { ButtonHTMLAttributes } from 'react'

/**
 * Primary fill, white 14px medium lowercase text.
 * Main actions are full width and 48px; `compact` sits beside a 40px field (the share card's copy).
 */
export function Button({
  compact = false,
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { compact?: boolean }) {
  return (
    <button
      {...props}
      className={`flex shrink-0 items-center justify-center bg-primary text-button font-medium text-white lowercase disabled:opacity-50 ${compact ? 'h-10 px-5' : 'h-12 w-full px-2.5'} ${className}`}
    />
  )
}
