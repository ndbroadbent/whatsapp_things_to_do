/**
 * Activity ID Generation
 *
 * Generates deterministic 16-char activity IDs from activity fields.
 * Uses SHA256 hash of field values in alphabetical order.
 */

import { createHash } from 'node:crypto'

/**
 * Generate a deterministic 16-char activity ID from all fields.
 * Uses SHA256 hash of field values in alphabetical order.
 */
export function generateActivityId(fields: Record<string, unknown>): string {
  const keys = Object.keys(fields).sort()
  const values = keys.map((k) => String(fields[k] ?? ''))
  const input = values.join('|')
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}
