import { X } from 'lucide-react'

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
}

export function WelcomeModal({ open, onClose }: WelcomeModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded p-1 text-mps-muted transition hover:bg-mps-gray hover:text-mps-text"
          aria-label="Close welcome"
        >
          <X className="h-5 w-5" />
        </button>

        <h2
          id="welcome-title"
          className="pr-8 text-xl font-bold text-mps-blue sm:text-2xl"
        >
          Welcome to the MPS Long-Range Facilities Plan Strategy Tool
        </h2>

        <p className="mt-4 text-sm leading-relaxed text-mps-text sm:text-base">
          This tool helps analyze and prioritize school facilities based on multiple
          criteria. Use <strong>View and Update Data Sources</strong> to reload the
          Google Sheet or upload GeoJSON locations. Start with{' '}
          <strong>Understand School-Level Data</strong>, then sort into strategy
          groups, compare schools on the map, and prioritize within groups.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-mps-blue px-4 py-3 text-sm font-semibold text-white transition hover:bg-mps-blue-dark"
        >
          Get Started
        </button>
      </div>
    </div>
  )
}
