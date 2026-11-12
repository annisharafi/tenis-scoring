import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * White card centred over a 50% black overlay, 20px from the screen edges: an optional small label
 * above the title (join card), an optional subtitle below it (share card), then the content.
 * A native modal dialog: it traps focus and makes the screen behind inert. It can't be dismissed
 * with Escape, because these cards are steps in a flow rather than optional popups.
 */
export function Modal({
  label,
  title,
  subtitle,
  children,
}: {
  label?: string
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => e.preventDefault()}
      className="m-auto w-[calc(100%-40px)] max-w-[390px] bg-transparent p-0 backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-5 bg-paper p-5 text-ink">
        <div className="flex flex-col gap-1">
          {label && <p className="text-small font-light lowercase opacity-50">{label}</p>}
          <h2 id={titleId} className="font-display text-title">
            {title}
          </h2>
          {subtitle && <p className="text-small font-light lowercase opacity-50">{subtitle}</p>}
        </div>
        {children}
      </div>
    </dialog>
  )
}
