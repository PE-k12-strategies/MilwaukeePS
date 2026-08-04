import { useState } from 'react'
import { ExternalLink, RotateCcw, Sheet, X } from 'lucide-react'
import {
  SHEET_SOURCE_META,
  type FallbackFieldInfo,
} from '../lib/sheetSources'

interface DataPanelProps {
  schoolCount: number
  dataLabel: string
  loading?: boolean
  fallbackFields: FallbackFieldInfo[]
  onReloadDefault: () => void
  error: string | null
}

const PRIMARY_META = SHEET_SOURCE_META.new
const LEGACY_META = SHEET_SOURCE_META.old

export function DataPanel({
  schoolCount,
  dataLabel,
  loading = false,
  fallbackFields,
  onReloadDefault,
  error,
}: DataPanelProps) {
  const [sheetEditorOpen, setSheetEditorOpen] = useState(false)
  const headerIssues = fallbackFields.filter((f) => f.reason === 'header-mismatch')
  const otherIssues = fallbackFields.filter((f) => f.reason !== 'header-mismatch')
  const embedSrc = PRIMARY_META.embedUrl ?? PRIMARY_META.workbookUrl

  return (
    <>
      <aside className="flex w-full flex-col gap-4">
        <section className="card p-5">
          <h2 className="mb-3 text-base font-bold text-mps-blue">Data Input</h2>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onReloadDefault}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-mps-blue px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-mps-blue-dark disabled:opacity-60"
            >
              <RotateCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading Sheet…' : 'Refresh Data from Google Sheet'}
            </button>
            <button
              type="button"
              onClick={() => setSheetEditorOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-mps-blue bg-white px-3 py-2.5 text-sm font-semibold text-mps-blue transition hover:bg-mps-blue-soft"
            >
              <Sheet className="h-4 w-4" />
              Edit Google Sheet
            </button>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-mps-muted">
            Attribute data is read live from the Google Sheet by matching column
            header names (column order can change). School map locations come from
            the built-in MPSSchools GeoJSON (matched by DPI / schoolId). Only schools
            with Include in Evaluation = Y on the new sheet are loaded (never from
            legacy Evaluate). Other missing mapped fields may fall back to the
            legacy LRFMP workbook — see the amber list below when that happens.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-mps-muted">
            Source workbook:{' '}
            <a
              href={PRIMARY_META.workbookUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-mps-blue underline"
            >
              {PRIMARY_META.workbookTitle}
            </a>
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-mps-muted">
            Legacy fallback:{' '}
            <a
              href={LEGACY_META.workbookUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-mps-blue underline"
            >
              {LEGACY_META.workbookTitle}
            </a>
          </p>

          {schoolCount > 0 && !error && (
            <p className="mt-3 text-sm font-medium text-mps-success">
              ✓ Loaded {schoolCount} school{schoolCount === 1 ? '' : 's'}.
            </p>
          )}
          <p className="mt-1 text-xs text-mps-muted">
            Dataset: <span className="font-medium text-mps-text">{dataLabel}</span>
          </p>

          {headerIssues.length > 0 && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs font-semibold text-red-900">
                Column header issues ({headerIssues.length})
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-red-900/80">
                A mapped field’s header is missing or ambiguous on the sheet. Update
                the label in{' '}
                <code className="rounded bg-red-100 px-0.5">newSheetFieldMap.ts</code>{' '}
                to match the sheet, or restore the header name. Other attributes may
                fall back to the legacy workbook; Include in Evaluation never does.
              </p>
              <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-[11px] text-red-950">
                {headerIssues.map((f) => (
                  <li key={f.key}>
                    {f.label}
                    {f.detail ? (
                      <span className="text-red-800/80"> — {f.detail}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {otherIssues.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <p className="text-xs font-semibold text-amber-900">
                Fields using legacy workbook fallback ({otherIssues.length})
              </p>
              <ul className="mt-1.5 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-[11px] text-amber-950">
                {otherIssues.map((f) => (
                  <li key={f.key}>
                    {f.label}
                    <span className="text-amber-800/80">
                      {' '}
                      —{' '}
                      {f.reason === 'unmapped'
                        ? 'not in sheet field map'
                        : f.reason === 'distance-matrix-unavailable'
                          ? 'SchoolToSchoolDistances unavailable; using legacy values'
                          : 'blank / error in Google Sheet'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          )}
        </section>
      </aside>

      {sheetEditorOpen && (
        <div
          className="fixed inset-0 z-[1200] flex flex-col bg-slate-900/50 p-2 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sheet-editor-title"
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-mps-gray-border bg-white shadow-2xl">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-mps-gray-border px-3 py-2.5 sm:px-4">
              <div className="min-w-0">
                <h3
                  id="sheet-editor-title"
                  className="text-base font-bold text-mps-blue"
                >
                  Edit Google Sheet
                </h3>
                <p className="text-[11px] text-mps-muted sm:text-xs">
                  In-app editing is experimental — Google may block the embed. Use
                  “Open in new tab” if the sheet does not load. Reload dashboard data
                  after saving changes.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <a
                  href={PRIMARY_META.workbookUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-mps-gray-border bg-white px-2.5 py-1.5 text-xs font-semibold text-mps-text transition hover:bg-mps-gray"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in new tab
                </a>
                <button
                  type="button"
                  disabled={loading}
                  onClick={onReloadDefault}
                  className="inline-flex items-center gap-1.5 rounded-md bg-mps-blue px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-mps-blue-dark disabled:opacity-60"
                >
                  <RotateCcw
                    className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                  />
                  {loading ? 'Reloading…' : 'Reload data'}
                </button>
                <button
                  type="button"
                  onClick={() => setSheetEditorOpen(false)}
                  className="rounded p-1.5 text-mps-muted transition hover:bg-mps-gray hover:text-mps-text"
                  aria-label="Close sheet editor"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="relative min-h-0 flex-1 bg-mps-gray">
              <iframe
                title={PRIMARY_META.workbookTitle}
                src={embedSrc}
                className="absolute inset-0 h-full w-full border-0"
                allow="clipboard-read; clipboard-write"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
