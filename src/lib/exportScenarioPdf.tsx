import { createRoot } from 'react-dom/client'
import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import { GROUP_WEIGHT_CONFIGS } from '../config/prioritizationWeights'
import { PRIORITIZATION_GROUPS } from '../config/prioritizationGroups'
import type { DecisionThresholds } from '../config/strategyGroups'
import { DecisionFlowchart } from '../components/DecisionFlowchart'
import { WeightSlider } from '../components/WeightSlider'

export interface ScenarioPdfOptions {
  scenarioName: string
  scenarioDescription?: string
  thresholds: DecisionThresholds
  weightsByGroup: Record<string, Record<string, number>>
}

function PdfCaptureRoot({
  thresholds,
  weightsByGroup,
  scenarioName,
  scenarioDescription,
}: ScenarioPdfOptions) {
  return (
    <div
      style={{
        width: 1100,
        background: '#f3f4f6',
        padding: 24,
        fontFamily: 'Inter, Segoe UI, system-ui, sans-serif',
        color: '#1f2937',
      }}
    >
      <div data-pdf-section="flowchart" style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: '#1d4ed8',
            margin: '0 0 8px',
            lineHeight: 1.3,
          }}
        >
          MPS LRFMP Strategy Tool — Scenario Summary
        </h1>
        <p
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: '0 0 6px',
            lineHeight: 1.35,
          }}
        >
          {scenarioName}
        </p>
        {scenarioDescription ? (
          <p
            style={{
              fontSize: 13,
              color: '#6b7280',
              margin: '0 0 16px',
              lineHeight: 1.4,
            }}
          >
            {scenarioDescription}
          </p>
        ) : (
          <div style={{ height: 12 }} />
        )}
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
          Decision flowchart inputs
        </h2>
        <div
          style={{
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <DecisionFlowchart
            path={[]}
            thresholds={thresholds}
            onThresholdsChange={() => {
              /* read-only capture */
            }}
            expanded
            captureMode
          />
        </div>
      </div>

      <div data-pdf-section="weights">
        <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px' }}>
          Prioritization weight inputs
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {PRIORITIZATION_GROUPS.map((group) => {
            const config = GROUP_WEIGHT_CONFIGS[group.weightConfigId]
            if (!config) return null
            const weights = weightsByGroup[group.id] ?? config.defaultWeights
            return (
              <div
                key={group.id}
                data-pdf-weight-group={group.id}
                style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    borderBottom: '1px solid #e5e7eb',
                    padding: '14px 20px',
                    fontSize: 16,
                    fontWeight: 700,
                  }}
                >
                  {config.title}
                </div>
                <div
                  style={{
                    padding: 20,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px 24px',
                  }}
                >
                  {config.criteria.map((criterion) => (
                    <WeightSlider
                      key={criterion.key}
                      label={criterion.label}
                      description={criterion.description}
                      value={weights[criterion.key] ?? 0}
                      readOnly
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

async function canvasFromElement(el: HTMLElement) {
  return html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })
}

function addCanvasPage(pdf: jsPDF, canvas: HTMLCanvasElement) {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 12
  const maxW = pageW - margin * 2
  const maxH = pageH - margin * 2
  const imgW = canvas.width
  const imgH = canvas.height
  const scale = Math.min(maxW / imgW, maxH / imgH)
  const drawW = imgW * scale

  const pageImgH = maxH / scale
  let srcY = 0
  let first = true
  while (srcY < imgH) {
    if (!first) pdf.addPage()
    first = false
    const sliceH = Math.min(pageImgH, imgH - srcY)
    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = imgW
    sliceCanvas.height = Math.ceil(sliceH)
    const ctx = sliceCanvas.getContext('2d')
    if (!ctx) break
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height)
    ctx.drawImage(canvas, 0, srcY, imgW, sliceH, 0, 0, imgW, sliceH)
    const sliceDrawH = sliceH * scale
    pdf.addImage(
      sliceCanvas.toDataURL('image/png'),
      'PNG',
      margin,
      margin,
      drawW,
      sliceDrawH,
    )
    srcY += sliceH
  }
}

export async function downloadScenarioPdf(
  options: ScenarioPdfOptions,
): Promise<void> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText =
    'position:fixed;left:-14000px;top:0;width:1100px;z-index:-1;pointer-events:none;'
  document.body.appendChild(host)

  const root = createRoot(host)
  try {
    await new Promise<void>((resolve) => {
      root.render(<PdfCaptureRoot {...options} />)
      window.setTimeout(() => resolve(), 500)
    })

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'letter',
    })

    const flowchart = host.querySelector(
      '[data-pdf-section="flowchart"]',
    ) as HTMLElement | null

    let pageStarted = false
    if (flowchart) {
      addCanvasPage(pdf, await canvasFromElement(flowchart))
      pageStarted = true
    }

    const weightCards = Array.from(
      host.querySelectorAll<HTMLElement>('[data-pdf-weight-group]'),
    )
    for (const card of weightCards) {
      if (pageStarted) pdf.addPage()
      addCanvasPage(pdf, await canvasFromElement(card))
      pageStarted = true
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const safeName = options.scenarioName
      .replace(/[^\w\-]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)
    pdf.save(`scenario-summary-${safeName || 'export'}-${stamp}.pdf`)
  } finally {
    root.unmount()
    host.remove()
  }
}
