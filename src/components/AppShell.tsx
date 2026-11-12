import type { ReactNode } from 'react'

/**
 * Fluid 360–430px column, centred on wider screens, with the thin vertical rule
 * 40px from the left. Content runs from 60px to 20px before the right edge.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto min-h-dvh w-full max-w-app bg-paper">
      <div aria-hidden className="absolute inset-y-0 left-rule w-0 border-l-[0.5px] border-line" />
      <div className="relative pr-gutter-r pl-gutter-l">{children}</div>
    </div>
  )
}
