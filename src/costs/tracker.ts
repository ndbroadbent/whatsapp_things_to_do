/**
 * Cost Tracker
 *
 * A session-based cost tracker that accumulates usage during processing.
 * Used by both CLI (for displaying costs) and SaaS (for billing).
 */

import { groupByProvider, groupByResource, microsToCents, sumUsageCosts } from './calculator'
import type { MeteredResource, MicroDollars, UsageRecord, UsageSummary } from './types'

/**
 * Cost tracker for accumulating usage during a processing session.
 *
 * Thread-safe design: each method operates atomically on the records array.
 *
 * @example
 * ```typescript
 * const tracker = new CostTracker()
 *
 * // Record AI usage
 * tracker.recordAI('gpt-4o-mini', 1000, 500)
 *
 * // Record geocoding
 * tracker.recordGeocoding(10)
 *
 * // Get summary
 * const summary = tracker.getSummary()
 * console.log(`Total cost: $${(summary.totalCostCents / 100).toFixed(2)}`)
 * ```
 */
export class CostTracker {
  private records: UsageRecord[] = []

  /**
   * Add a usage record.
   */
  addRecord(record: UsageRecord): void {
    this.records.push(record)
  }

  /**
   * Add multiple usage records.
   */
  addRecords(records: UsageRecord[]): void {
    this.records.push(...records)
  }

  /**
   * Get all usage records.
   */
  getRecords(): readonly UsageRecord[] {
    return this.records
  }

  /**
   * Get the total cost in micro-dollars.
   */
  getTotalCostMicros(): MicroDollars {
    return sumUsageCosts(this.records)
  }

  /**
   * Get the total cost in cents.
   */
  getTotalCostCents(): number {
    return microsToCents(this.getTotalCostMicros())
  }

  /**
   * Get a full usage summary.
   */
  getSummary(): UsageSummary {
    const totalCostMicros = this.getTotalCostMicros()

    return {
      totalCostMicros,
      totalCostCents: microsToCents(totalCostMicros),
      byResource: groupByResource(this.records),
      byProvider: groupByProvider(this.records),
      records: [...this.records]
    }
  }

  /**
   * Clear all records.
   */
  clear(): void {
    this.records = []
  }

  /**
   * Get count of records.
   */
  get recordCount(): number {
    return this.records.length
  }

  /**
   * Check if there are any records.
   */
  get hasRecords(): boolean {
    return this.records.length > 0
  }

  /**
   * Format the current costs for display.
   */
  formatSummary(): string {
    if (!this.hasRecords) {
      return 'No usage recorded'
    }

    const summary = this.getSummary()
    const lines: string[] = []

    lines.push(`Total: $${(summary.totalCostCents / 100).toFixed(2)}`)
    lines.push('')
    lines.push('By resource:')

    const resources = Object.entries(summary.byResource) as [
      MeteredResource,
      { quantity: number; costMicros: MicroDollars }
    ][]

    for (const [resource, data] of resources) {
      const costDollars = (data.costMicros / 1_000_000).toFixed(4)
      lines.push(`  ${resource}: ${data.quantity.toLocaleString()} × $${costDollars}`)
    }

    return lines.join('\n')
  }

  /**
   * Create a JSON-serializable representation.
   */
  toJSON(): {
    totalCostMicros: MicroDollars
    totalCostCents: number
    records: UsageRecord[]
  } {
    return {
      totalCostMicros: this.getTotalCostMicros(),
      totalCostCents: this.getTotalCostCents(),
      records: this.records.map((r) => ({
        ...r,
        timestamp: r.timestamp.toISOString() as unknown as Date
      }))
    }
  }

  /**
   * Create a tracker from JSON data.
   */
  static fromJSON(data: {
    records: Array<Omit<UsageRecord, 'timestamp'> & { timestamp: string }>
  }): CostTracker {
    const tracker = new CostTracker()

    for (const record of data.records) {
      tracker.addRecord({
        ...record,
        timestamp: new Date(record.timestamp)
      })
    }

    return tracker
  }
}

/**
 * Create a new cost tracker.
 */
export function createCostTracker(): CostTracker {
  return new CostTracker()
}
