import type { NewSheetTabKey } from '../config/newSheetFieldMap'
import type { GvizTable } from './googleSheets'
import { resolveNewSheetColumns } from './resolveNewSheetColumns'
import type { FallbackFieldInfo } from './sheetSources'

/**
 * Resolve mapped fields by live header names and report missing/ambiguous headers.
 * Column letters are not used — inserts/moves are fine as long as labels match.
 */
export function validateNewSheetHeaders(
  tables: Record<NewSheetTabKey, GvizTable>,
): FallbackFieldInfo[] {
  return resolveNewSheetColumns(tables).issues
}
