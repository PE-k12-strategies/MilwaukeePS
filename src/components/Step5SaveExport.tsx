import { useState } from 'react'
import { Check, Copy, Download, FileText, Link2 } from 'lucide-react'
import type { DecisionThresholds } from '../config/strategyGroups'
import type { PrioritizationGroupId } from '../config/prioritizationGroups'
import {
  downloadAllRankedGroupsCsv,
  downloadAllSchoolsCsv,
} from '../lib/exportRankedCsv'
import { downloadScenarioPdf } from '../lib/exportScenarioPdf'
import {
  buildScenarioShareUrl,
  type SharedScenario,
} from '../lib/scenarioShare'
import type { ClassificationResult, SchoolProperties } from '../types/school'

interface Step5SaveExportProps {
  schools: SchoolProperties[]
  classifications: ClassificationResult[]
  thresholds: DecisionThresholds
  weightsByGroup: Record<string, Record<string, number>>
  activeGroupId: PrioritizationGroupId
}

export function Step5SaveExport({
  schools,
  classifications,
  thresholds,
  weightsByGroup,
  activeGroupId,
}: Step5SaveExportProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)

  const buildScenario = (scenarioName: string, scenarioDescription: string): SharedScenario => ({
    v: 1 as const,
    name: scenarioName,
    description: scenarioDescription || undefined,
    groupId: activeGroupId,
    weights: weightsByGroup,
    thresholds,
  })

  const generate = () => {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a scenario name to generate a share link.')
      setShareUrl(null)
      return
    }
    setError(null)
    setCopied(false)
    const scenario = buildScenario(trimmed, description.trim())
    const url = buildScenarioShareUrl(scenario)
    setShareUrl(url)
    try {
      const next = new URL(url)
      window.history.replaceState({}, '', `${next.pathname}${next.search}`)
    } catch {
      /* ignore history failures (file:// etc.) */
    }
  }

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy automatically — select the link and copy manually.')
    }
  }

  const handlePdf = async () => {
    setPdfBusy(true)
    setError(null)
    try {
      await downloadScenarioPdf({
        scenarioName: name.trim() || 'Untitled scenario',
        scenarioDescription: description.trim(),
        thresholds,
        weightsByGroup,
      })
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not generate the PDF summary.',
      )
    } finally {
      setPdfBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <h2 className="shrink-0 whitespace-nowrap pt-1 text-xl font-bold text-mps-blue">
            Save and Export Scenario
          </h2>
          <div className="w-fit max-w-full rounded-lg border border-mps-blue-border bg-mps-blue-soft px-4 py-2.5 text-sm leading-snug text-mps-text">
            Name your scenario and generate a shareable link, or download CSV and PDF
            summaries of how schools are sorted and prioritized with your current
            thresholds and weights.
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
        <section className="flex h-full flex-col rounded-lg border border-mps-gray-border bg-white p-5">
          <h3 className="text-sm font-semibold text-mps-text">Share this scenario</h3>
          <p className="mt-1 text-xs text-mps-muted">
            Create a link that opens the Prioritize tab with your saved weights and
            decision thresholds.
          </p>

          <label className="mt-4 mb-1 block text-sm font-bold text-mps-text">
            Scenario Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
            placeholder="Enter a name for this scenario"
            className="mb-4 w-full rounded-md border border-mps-gray-border bg-white px-3 py-2 text-sm outline-none focus:border-mps-blue"
          />

          <label className="mb-1 block text-sm font-bold text-mps-text">
            Description (Optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the key assumptions or focus of this scenario"
            className="mb-4 w-full flex-1 resize-y rounded-md border border-mps-gray-border bg-white px-3 py-2 text-sm outline-none focus:border-mps-blue"
          />

          <button
            type="button"
            onClick={generate}
            className="mt-auto flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-bold text-white transition hover:bg-neutral-800"
          >
            <Link2 className="h-4 w-4" />
            Generate Share Link
          </button>

          {shareUrl && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold tracking-wide text-mps-muted uppercase">
                Share link
              </p>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                  className="min-w-0 w-full rounded-md border border-mps-gray-border bg-mps-gray px-3 py-2 text-xs text-mps-text outline-none"
                />
                <button
                  type="button"
                  onClick={() => void copyLink()}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-mps-gray-border bg-white px-3 py-2 text-xs font-semibold text-mps-text hover:bg-mps-gray"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-mps-success" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="flex h-full flex-col rounded-lg border border-mps-gray-border bg-white p-5">
          <h3 className="text-sm font-semibold text-mps-text">Download summaries</h3>
          <p className="mt-1 text-xs text-mps-muted">
            Exports use your current decision thresholds and prioritization weights. A
            scenario name is not required.
          </p>

          <div className="mt-4 flex flex-1 flex-col gap-3">
            <button
              type="button"
              disabled={schools.length === 0}
              onClick={() => downloadAllSchoolsCsv(schools, classifications)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-mps-gray-border bg-white px-3 py-2.5 text-sm font-semibold text-mps-text transition hover:bg-mps-gray disabled:opacity-40"
            >
              <Download className="h-4 w-4 shrink-0" />
              Strategy group assignment (CSV)
            </button>
            <button
              type="button"
              disabled={schools.length === 0}
              onClick={() =>
                downloadAllRankedGroupsCsv(schools, classifications, weightsByGroup)
              }
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-mps-gray-border bg-white px-3 py-2.5 text-sm font-semibold text-mps-text transition hover:bg-mps-gray disabled:opacity-40"
            >
              <Download className="h-4 w-4 shrink-0" />
              Prioritization rankings — all groups (CSV)
            </button>
            <button
              type="button"
              disabled={pdfBusy}
              onClick={() => void handlePdf()}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-mps-blue px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-mps-blue-dark disabled:opacity-40"
            >
              <FileText className="h-4 w-4 shrink-0" />
              {pdfBusy ? 'Building PDF…' : 'Flowchart & weights summary (PDF)'}
            </button>
          </div>
        </section>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}
