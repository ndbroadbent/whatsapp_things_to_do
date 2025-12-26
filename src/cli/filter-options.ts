/**
 * Filter Options Builder
 *
 * Builds FilterOptions from CLI args and config with proper precedence:
 * CLI arg > format-specific config > export config > default
 */

import type { FilterOptions, SortOrder } from '../export/filter'
import type { CLIArgs } from './args'
import type { Config } from './config'

/**
 * Parse a date string (YYYY-MM-DD) into a Date object.
 * Returns undefined if the string is not a valid date.
 */
function parseDate(dateStr: string | undefined): Date | undefined {
  if (!dateStr) return undefined
  const date = new Date(dateStr)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Get effective array with precedence (empty arrays don't override).
 */
function getEffectiveArray(
  cliValue: readonly string[],
  formatConfigValue: readonly string[] | undefined,
  exportConfigValue: readonly string[] | undefined
): readonly string[] | undefined {
  if (cliValue.length > 0) return cliValue
  if (formatConfigValue && formatConfigValue.length > 0) return formatConfigValue
  if (exportConfigValue && exportConfigValue.length > 0) return exportConfigValue
  return undefined
}

/**
 * Build FilterOptions for common export formats (CSV, Excel, JSON, Map).
 * Uses export* CLI args and config settings.
 */
function buildCommonFilterOptions(args: CLIArgs, config: Config | null): FilterOptions {
  const options: FilterOptions = {}

  // Categories
  const categories = getEffectiveArray(args.exportCategories, undefined, config?.exportCategories)
  if (categories) {
    ;(options as { categories: readonly string[] }).categories = categories
  }

  // Countries
  const countries = getEffectiveArray(args.exportCountries, undefined, config?.exportCountries)
  if (countries) {
    ;(options as { countries: readonly string[] }).countries = countries
  }

  // From (sender names)
  const from = getEffectiveArray(args.exportFrom, undefined, config?.exportFrom)
  if (from) {
    ;(options as { from: readonly string[] }).from = from
  }

  // Start date
  const startDate = parseDate(args.exportStartDate ?? config?.exportStartDate)
  if (startDate) {
    ;(options as { startDate: Date }).startDate = startDate
  }

  // End date
  const endDate = parseDate(args.exportEndDate ?? config?.exportEndDate)
  if (endDate) {
    ;(options as { endDate: Date }).endDate = endDate
  }

  // Min score
  const minScore = args.exportMinScore ?? config?.exportMinScore
  if (minScore !== undefined) {
    ;(options as { minScore: number }).minScore = minScore
  }

  // Only locations
  if (args.exportOnlyLocations || config?.exportOnlyLocations) {
    ;(options as { onlyLocations: boolean }).onlyLocations = true
  }

  // Only generic
  if (args.exportOnlyGeneric || config?.exportOnlyGeneric) {
    ;(options as { onlyGeneric: boolean }).onlyGeneric = true
  }

  // Max activities
  const maxActivities =
    args.exportMaxActivities > 0 ? args.exportMaxActivities : config?.exportMaxActivities
  if (maxActivities && maxActivities > 0) {
    ;(options as { maxActivities: number }).maxActivities = maxActivities
  }

  // Sort
  const sort = (args.exportSort !== 'score' ? args.exportSort : config?.exportSort) as
    | SortOrder
    | undefined
  if (sort && sort !== 'score') {
    ;(options as { sort: SortOrder }).sort = sort
  }

  return options
}

/**
 * Helper to get PDF-effective array (pdf → export fallback).
 */
function getPdfEffectiveArray(
  pdfCli: readonly string[],
  pdfConfig: readonly string[] | undefined,
  exportCli: readonly string[],
  exportConfig: readonly string[] | undefined
): readonly string[] | undefined {
  return getEffectiveArray(pdfCli, pdfConfig, exportCli.length > 0 ? exportCli : exportConfig)
}

/**
 * Helper to check if any of the boolean flags is true.
 */
function anyTrue(...flags: (boolean | undefined)[]): boolean {
  return flags.some((f) => f === true)
}

/**
 * Build FilterOptions for PDF export.
 * Uses pdf* CLI args/config which override export* settings.
 */
function buildPdfFilterOptions(args: CLIArgs, config: Config | null): FilterOptions {
  const options: FilterOptions = {}

  // Categories (PDF-specific → export)
  const categories = getPdfEffectiveArray(
    args.pdfCategories,
    config?.pdfCategories,
    args.exportCategories,
    config?.exportCategories
  )
  if (categories) {
    ;(options as { categories: readonly string[] }).categories = categories
  }

  // Countries (PDF-specific → export)
  const countries = getPdfEffectiveArray(
    args.pdfCountries,
    config?.pdfCountries,
    args.exportCountries,
    config?.exportCountries
  )
  if (countries) {
    ;(options as { countries: readonly string[] }).countries = countries
  }

  // From (PDF-specific → export)
  const from = getPdfEffectiveArray(
    args.pdfFrom,
    config?.pdfFrom,
    args.exportFrom,
    config?.exportFrom
  )
  if (from) {
    ;(options as { from: readonly string[] }).from = from
  }

  // Start date (PDF-specific → export)
  const startDate = parseDate(
    args.pdfStartDate ?? config?.pdfStartDate ?? args.exportStartDate ?? config?.exportStartDate
  )
  if (startDate) {
    ;(options as { startDate: Date }).startDate = startDate
  }

  // End date (PDF-specific → export)
  const endDate = parseDate(
    args.pdfEndDate ?? config?.pdfEndDate ?? args.exportEndDate ?? config?.exportEndDate
  )
  if (endDate) {
    ;(options as { endDate: Date }).endDate = endDate
  }

  // Min score (PDF-specific → export)
  const minScore =
    args.pdfMinScore ?? config?.pdfMinScore ?? args.exportMinScore ?? config?.exportMinScore
  if (minScore !== undefined) {
    ;(options as { minScore: number }).minScore = minScore
  }

  // Only locations/generic (PDF-specific → export)
  if (
    anyTrue(
      args.pdfOnlyLocations,
      config?.pdfOnlyLocations,
      args.exportOnlyLocations,
      config?.exportOnlyLocations
    )
  ) {
    ;(options as { onlyLocations: boolean }).onlyLocations = true
  }
  if (
    anyTrue(
      args.pdfOnlyGeneric,
      config?.pdfOnlyGeneric,
      args.exportOnlyGeneric,
      config?.exportOnlyGeneric
    )
  ) {
    ;(options as { onlyGeneric: boolean }).onlyGeneric = true
  }

  // Max activities (PDF-specific → export)
  const pdfMax = args.pdfMaxActivities > 0 ? args.pdfMaxActivities : config?.pdfMaxActivities
  const exportMax =
    args.exportMaxActivities > 0 ? args.exportMaxActivities : config?.exportMaxActivities
  const maxActivities = pdfMax ?? exportMax
  if (maxActivities && maxActivities > 0) {
    ;(options as { maxActivities: number }).maxActivities = maxActivities
  }

  // Sort (PDF-specific → export)
  const pdfSort = args.pdfSort !== 'score' ? args.pdfSort : config?.pdfSort
  const exportSort = args.exportSort !== 'score' ? args.exportSort : config?.exportSort
  const sort = (pdfSort ?? exportSort) as SortOrder | undefined
  if (sort && sort !== 'score') {
    ;(options as { sort: SortOrder }).sort = sort
  }

  return options
}

/**
 * Build FilterOptions for a specific export format.
 * PDF has its own override options, others use common export options.
 */
export function buildFilterOptions(
  format: string,
  args: CLIArgs,
  config: Config | null
): FilterOptions {
  if (format === 'pdf') {
    return buildPdfFilterOptions(args, config)
  }
  return buildCommonFilterOptions(args, config)
}
