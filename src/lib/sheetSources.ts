export type SheetSourceId = 'old' | 'new'

export const SHEET_SOURCE_META: Record<
  SheetSourceId,
  {
    id: string
    dataLabel: string
    workbookUrl: string
    workbookTitle: string
    /** Optional iframe src for in-app edit (may be blocked by Google). */
    embedUrl?: string
  }
> = {
  old: {
    id: '1s4CJXNvHBRV6s_IcqGV_P7YjsVJ4aZTl',
    dataLabel: 'Legacy LRFMP Decision Flow workbook (fallback)',
    workbookUrl:
      'https://docs.google.com/spreadsheets/d/1s4CJXNvHBRV6s_IcqGV_P7YjsVJ4aZTl/edit?usp=sharing',
    workbookTitle: '24-25 LRFMP Facility Strategy Framework Decision Flow',
  },
  new: {
    id: '1vw8384GiOYj2kvn0TGW-vXdpyVDDBlRmTg5uFDHLoOQ',
    dataLabel: 'MPS School Exploration Data (live)',
    workbookUrl:
      'https://docs.google.com/spreadsheets/d/1vw8384GiOYj2kvn0TGW-vXdpyVDDBlRmTg5uFDHLoOQ/edit?usp=sharing',
    /** Embed/edit attempt URL (Google may still block framing depending on share settings). */
    embedUrl:
      'https://docs.google.com/spreadsheets/d/1vw8384GiOYj2kvn0TGW-vXdpyVDDBlRmTg5uFDHLoOQ/edit?usp=sharing&rm=minimal',
    workbookTitle: 'MPS School Exploration Data',
  },
}

export interface FallbackFieldInfo {
  /** Stable property / logical key */
  key: string
  /** Human-readable label for Data Input */
  label: string
  reason:
    | 'unmapped'
    | 'missing-value'
    | 'distance-matrix-unavailable'
    /** Header missing or ambiguous on the mapped tab (label-based lookup). */
    | 'header-mismatch'
  /** Extra context (e.g. header not found vs expected label) */
  detail?: string
}
