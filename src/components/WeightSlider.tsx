/** Shared prioritization weight slider (0–10 scale; 0 = excluded from ranking). */
const SLIDER_MIN = 0
const SLIDER_MAX = 10

export function WeightSlider({
  label,
  description,
  value,
  onChange,
  readOnly = false,
}: {
  label: string
  description: string
  value: number
  onChange?: (value: number) => void
  readOnly?: boolean
}) {
  const sliderValue = Math.min(SLIDER_MAX, Math.max(SLIDER_MIN, value))
  const fillPct = (sliderValue / SLIDER_MAX) * 100
  const inactive = value <= 0

  return (
    <div className={inactive ? 'opacity-45' : undefined}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label
          className={`text-sm font-semibold ${inactive ? 'text-mps-muted' : ''}`}
        >
          {label}
        </label>
        <span
          className={`text-sm font-semibold tabular-nums ${
            inactive ? 'text-mps-muted' : ''
          }`}
        >
          {value.toFixed(1)}
        </span>
      </div>
      <div className="relative h-4">
        <div
          className={`pointer-events-none absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 overflow-hidden rounded-full ${
            inactive ? 'bg-mps-gray-border' : 'bg-[#f5c518]'
          }`}
        >
          <div
            className={`h-full rounded-full ${inactive ? 'bg-mps-muted' : 'bg-[#111]'}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
        {/* Visible thumb (html2canvas cannot reliably draw native range thumbs) */}
        <div
          className={`pointer-events-none absolute top-1/2 z-[1] h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white ${
            inactive ? 'border-mps-muted' : 'border-[#111]'
          }`}
          style={{ left: `${fillPct}%` }}
          aria-hidden
        />
        <input
          type="range"
          min={SLIDER_MIN}
          max={SLIDER_MAX}
          step={0.5}
          value={sliderValue}
          disabled={readOnly}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="absolute inset-0 z-[2] m-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label={label}
        />
      </div>
      <p
        className={`mt-1 text-xs ${inactive ? 'text-mps-muted' : 'text-black/55'}`}
      >
        {description}
      </p>
    </div>
  )
}
