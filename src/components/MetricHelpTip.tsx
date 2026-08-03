import { CircleHelp } from 'lucide-react'
import { metricHelp } from '../config/metricHelp'

interface MetricHelpTipProps {
  /** Key into METRIC_HELP */
  helpKey?: string
  /** Override / one-off helper text */
  text?: string
  /** Prefer tip opening to the right (table labels) vs below (cards) */
  side?: 'right' | 'bottom'
  className?: string
}

/** Small “?” control that shows helper text on hover / focus. */
export function MetricHelpTip({
  helpKey,
  text,
  side = 'bottom',
  className = '',
}: MetricHelpTipProps) {
  const tip = text ?? metricHelp(helpKey)
  if (!tip) return null

  const panelPos =
    side === 'right'
      ? 'left-full top-1/2 ml-2 -translate-y-1/2'
      : 'left-1/2 top-full mt-1.5 -translate-x-1/2'

  return (
    <span className={`group relative inline-flex shrink-0 align-middle ${className}`}>
      <button
        type="button"
        className="rounded-full p-0.5 text-mps-muted transition hover:bg-mps-gray hover:text-mps-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-mps-blue"
        aria-label="More information"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-40 hidden max-w-[min(22rem,calc(100vw-2rem))] w-[min(22rem,calc(100vw-2rem))] rounded-md border border-mps-blue-border bg-white px-2.5 py-2 text-left text-[11px] leading-snug font-normal break-words whitespace-normal text-mps-text shadow-lg group-hover:block group-focus-within:block ${panelPos}`}
      >
        {tip}
      </span>
    </span>
  )
}
