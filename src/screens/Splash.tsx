import type { ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { AssetImg } from '../components/AssetImg'

/**
 * Full-bleed splash photo with the dark gradient, the light rules and the title.
 * `footer` fills the strip below the horizontal rule; `children` render over everything (1.1 Join card).
 */
export function SplashLayout({ footer, children }: { footer?: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-app flex-col justify-end overflow-hidden text-white">
      <AssetImg src="/images/splash.jpg" className="splash-photo absolute inset-0" />
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-black/0 to-black/40" />
      <div aria-hidden className="splash-rule-v absolute inset-y-0 left-rule w-0 border-l-[0.5px] border-white/30" />

      <div className="relative flex flex-col pr-gutter-r pb-11 pl-gutter-l">
        {/* The title rises from behind its own box. */}
        <h1 className="overflow-hidden font-display text-splash">
          <span className="splash-title block">play it fun!</span>
        </h1>
        <p className="splash-copy text-small font-light lowercase">
          Social doubles where every team is balanced. We mix strong and new players so every match stays close.
        </p>
      </div>
      <div className="relative ml-rule h-20 pt-5 pr-gutter-r pl-5">
        <div aria-hidden className="splash-rule-h absolute inset-x-0 top-0 border-t-[0.5px] border-white/30" />
        <div className="splash-action">{footer}</div>
      </div>
      {children}
    </div>
  )
}

export function Splash() {
  return (
    <SplashLayout
      footer={
        <Link
          to="/host/new"
          className="group flex items-center justify-between text-button font-medium tracking-[1px] transition-opacity duration-150 ease-out active:opacity-60"
        >
          host game!
          <ArrowUpRight
            aria-hidden
            className="size-5 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-focus-visible:translate-x-0.5 group-focus-visible:-translate-y-0.5"
            strokeWidth={1.5}
          />
        </Link>
      }
    />
  )
}
