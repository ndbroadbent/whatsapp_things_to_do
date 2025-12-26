/**
 * CLI Argument Parsing
 *
 * Uses commander for subcommand-based CLI with per-command options.
 */

import type { Command } from 'commander'
import type { SortOrder } from '../export/filter'
import { createProgram } from './commands'

export type ExtractionMethod = 'heuristics' | 'embeddings' | 'both'

export interface CLIArgs {
  command: string
  input: string
  outputDir: string
  formats: string[]
  minConfidence: number
  skipGeocoding: boolean
  fetchImages: boolean
  skipCdn: boolean
  skipPixabay: boolean
  skipWikipedia: boolean
  skipGooglePlaces: boolean
  quiet: boolean
  verbose: boolean
  dryRun: boolean
  debug: boolean
  maxResults: number
  maxMessages: number | undefined
  method: ExtractionMethod
  jsonOutput: string | undefined
  homeCountry: string | undefined
  timezone: string | undefined
  scrapeConcurrency: number
  scrapeTimeout: number
  noCache: boolean
  cacheDir: string | undefined
  configFile: string | undefined
  showAll: boolean

  // === Common export settings (apply to ALL formats) ===
  /** Filter ALL exports by categories */
  exportCategories: string[]
  /** Filter ALL exports by countries */
  exportCountries: string[]
  /** Filter ALL exports by sender names */
  exportFrom: string[]
  /** Filter ALL exports to on/after this date (YYYY-MM-DD) */
  exportStartDate: string | undefined
  /** Filter ALL exports to on/before this date (YYYY-MM-DD) */
  exportEndDate: string | undefined
  /** Min score threshold for ALL exports (0-3) */
  exportMinScore: number | undefined
  /** Only export activities with specific locations */
  exportOnlyLocations: boolean
  /** Only export generic activities without locations */
  exportOnlyGeneric: boolean
  /** Max activities in ALL exports (0 = all) */
  exportMaxActivities: number
  /** Sort order for ALL exports: score, oldest, newest */
  exportSort: SortOrder

  // === PDF-specific settings (override export* for PDF only) ===
  /** Include thumbnails in PDF exports */
  pdfThumbnails: boolean
  /** Show score in PDF output */
  pdfIncludeScore: boolean
  /** Group by country in PDF */
  pdfGroupByCountry: boolean
  /** Group by category in PDF */
  pdfGroupByCategory: boolean
  /** PDF page size: A4 or Letter */
  pdfPageSize: string | undefined
  /** Custom PDF title */
  pdfTitle: string | undefined
  /** Custom PDF subtitle */
  pdfSubtitle: string | undefined
  /** Filter PDF by categories (overrides exportCategories) */
  pdfCategories: string[]
  /** Filter PDF by countries (overrides exportCountries) */
  pdfCountries: string[]
  /** Filter PDF by sender names (overrides exportFrom) */
  pdfFrom: string[]
  /** Filter PDF to on/after this date (overrides exportStartDate) */
  pdfStartDate: string | undefined
  /** Filter PDF to on/before this date (overrides exportEndDate) */
  pdfEndDate: string | undefined
  /** Min score for PDF (overrides exportMinScore) */
  pdfMinScore: number | undefined
  /** Only locations in PDF (overrides exportOnlyLocations) */
  pdfOnlyLocations: boolean
  /** Only generic in PDF (overrides exportOnlyGeneric) */
  pdfOnlyGeneric: boolean
  /** Max activities in PDF (overrides exportMaxActivities) */
  pdfMaxActivities: number
  /** Sort order for PDF (overrides exportSort) */
  pdfSort: SortOrder

  // === Map-specific settings ===
  /** Default map tile style */
  mapDefaultStyle: string | undefined

  // === Export subcommand settings (unprefixed versions for subcommands) ===
  /** For export subcommands: single output file path */
  exportOutput: string | undefined
  /** For export subcommands: format being exported (pdf, json, csv, excel, map) */
  exportFormat: string | undefined

  /** For config command: action (list, set, unset) */
  configAction: 'list' | 'set' | 'unset'
  /** For config command: key name */
  configKey: string | undefined
  /** For config command: value to set */
  configValue: string | undefined
}

const DEFAULT_OUTPUT_DIR = './chat-to-map/output'

function parseMethod(value: unknown): ExtractionMethod {
  if (value === 'heuristics' || value === 'embeddings' || value === 'both') {
    return value
  }
  return 'both'
}

function parseSortOrder(value: unknown): SortOrder {
  if (value === 'oldest' || value === 'newest') {
    return value
  }
  return 'score'
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined
  const num = Number.parseFloat(String(value))
  return Number.isNaN(num) ? undefined : num
}

function parseBooleanWithNegation(positive: unknown, negative: unknown): boolean {
  if (negative === true) return false
  if (positive === true) return true
  return true // Default to true (for groupBy options)
}

function parseCommaSeparated(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function parseConfigAction(action: string | undefined): 'list' | 'set' | 'unset' {
  if (action === 'set' || action === 'unset') {
    return action
  }
  return 'list'
}

function buildCLIArgs(commandName: string, input: string, opts: Record<string, unknown>): CLIArgs {
  const format = typeof opts.format === 'string' ? opts.format : 'csv,excel,json,map,pdf'

  return {
    command: commandName,
    input,
    outputDir: typeof opts.outputDir === 'string' ? opts.outputDir : DEFAULT_OUTPUT_DIR,
    formats: format.split(',').map((f) => f.trim()),
    minConfidence: Number.parseFloat(String(opts.minConfidence ?? '0.5')),
    skipGeocoding: opts.skipGeocoding === true,
    fetchImages: opts.images === true,
    skipCdn: opts.imageCdn === false,
    skipPixabay: opts.skipPixabay === true,
    skipWikipedia: opts.skipWikipedia === true,
    skipGooglePlaces: opts.skipGooglePlaces === true,
    quiet: opts.quiet === true,
    verbose: opts.verbose === true,
    dryRun: opts.dryRun === true,
    debug: opts.debug === true,
    maxResults: Number.parseInt(String(opts.maxResults ?? '10'), 10),
    maxMessages: opts.maxMessages ? Number.parseInt(String(opts.maxMessages), 10) : undefined,
    method: parseMethod(opts.method),
    jsonOutput:
      opts.json === true ? 'stdout' : typeof opts.json === 'string' ? opts.json : undefined,
    homeCountry: typeof opts.homeCountry === 'string' ? opts.homeCountry : undefined,
    timezone: typeof opts.timezone === 'string' ? opts.timezone : undefined,
    scrapeConcurrency: Number.parseInt(String(opts.concurrency ?? '5'), 10),
    scrapeTimeout: Number.parseInt(String(opts.timeout ?? '4000'), 10),
    noCache: opts.cache === false,
    cacheDir: typeof opts.cacheDir === 'string' ? opts.cacheDir : undefined,
    configFile: typeof opts.configFile === 'string' ? opts.configFile : undefined,
    showAll: opts.all === true,

    // Common export settings
    exportCategories: parseCommaSeparated(opts.exportCategories),
    exportCountries: parseCommaSeparated(opts.exportCountries),
    exportFrom: parseCommaSeparated(opts.exportFrom),
    exportStartDate: typeof opts.exportStartDate === 'string' ? opts.exportStartDate : undefined,
    exportEndDate: typeof opts.exportEndDate === 'string' ? opts.exportEndDate : undefined,
    exportMinScore: parseOptionalNumber(opts.exportMinScore),
    exportOnlyLocations: opts.exportOnlyLocations === true,
    exportOnlyGeneric: opts.exportOnlyGeneric === true,
    exportMaxActivities: Number.parseInt(String(opts.exportMaxActivities ?? '0'), 10),
    exportSort: parseSortOrder(opts.exportSort),

    // PDF-specific settings
    pdfThumbnails: opts.pdfThumbnails === true,
    pdfIncludeScore: opts.pdfIncludeScore === true,
    pdfGroupByCountry: parseBooleanWithNegation(opts.pdfGroupByCountry, opts.pdfNoGroupByCountry),
    pdfGroupByCategory: parseBooleanWithNegation(
      opts.pdfGroupByCategory,
      opts.pdfNoGroupByCategory
    ),
    pdfPageSize: typeof opts.pdfPageSize === 'string' ? opts.pdfPageSize : undefined,
    pdfTitle: typeof opts.pdfTitle === 'string' ? opts.pdfTitle : undefined,
    pdfSubtitle: typeof opts.pdfSubtitle === 'string' ? opts.pdfSubtitle : undefined,
    pdfCategories: parseCommaSeparated(opts.pdfCategories),
    pdfCountries: parseCommaSeparated(opts.pdfCountries),
    pdfFrom: parseCommaSeparated(opts.pdfFrom),
    pdfStartDate: typeof opts.pdfStartDate === 'string' ? opts.pdfStartDate : undefined,
    pdfEndDate: typeof opts.pdfEndDate === 'string' ? opts.pdfEndDate : undefined,
    pdfMinScore: parseOptionalNumber(opts.pdfMinScore),
    pdfOnlyLocations: opts.pdfOnlyLocations === true,
    pdfOnlyGeneric: opts.pdfOnlyGeneric === true,
    pdfMaxActivities: Number.parseInt(String(opts.pdfMaxActivities ?? '0'), 10),
    pdfSort: parseSortOrder(opts.pdfSort),

    // Map-specific settings
    mapDefaultStyle: typeof opts.mapDefaultStyle === 'string' ? opts.mapDefaultStyle : undefined,

    // Export subcommand settings
    exportOutput: typeof opts.output === 'string' ? opts.output : undefined,
    exportFormat: undefined,

    configAction: 'list',
    configKey: undefined,
    configValue: undefined
  }
}

/**
 * Parse unprefixed export options from subcommand.
 */
function parseUnprefixedExportOpts(opts: Record<string, unknown>) {
  return {
    categories: parseCommaSeparated(opts.categories),
    countries: parseCommaSeparated(opts.countries),
    from: parseCommaSeparated(opts.from),
    startDate: typeof opts.startDate === 'string' ? opts.startDate : undefined,
    endDate: typeof opts.endDate === 'string' ? opts.endDate : undefined,
    minScore: parseOptionalNumber(opts.minScore),
    onlyLocations: opts.onlyLocations === true,
    onlyGeneric: opts.onlyGeneric === true,
    maxActivities: opts.maxActivities ? Number.parseInt(String(opts.maxActivities), 10) : 0,
    sort: parseSortOrder(opts.sort)
  }
}

/**
 * Parse PDF-specific unprefixed options from subcommand.
 */
function parsePdfSubcommandOpts(opts: Record<string, unknown>) {
  return {
    thumbnails: opts.thumbnails === true,
    includeScore: opts.includeScore === true,
    groupByCountry: parseBooleanWithNegation(opts.groupByCountry, opts.noGroupByCountry),
    groupByCategory: parseBooleanWithNegation(opts.groupByCategory, opts.noGroupByCategory),
    pageSize: typeof opts.pageSize === 'string' ? opts.pageSize : undefined,
    title: typeof opts.title === 'string' ? opts.title : undefined,
    subtitle: typeof opts.subtitle === 'string' ? opts.subtitle : undefined
  }
}

/**
 * Build CLIArgs from export subcommand options (unprefixed args).
 */
function buildExportSubcommandArgs(
  format: string,
  input: string,
  opts: Record<string, unknown>
): CLIArgs {
  const base = buildCLIArgs(`export-${format}`, input, opts)
  const exp = parseUnprefixedExportOpts(opts)
  const pdf = format === 'pdf' ? parsePdfSubcommandOpts(opts) : null
  const mapStyle =
    format === 'map' && typeof opts.defaultStyle === 'string' ? opts.defaultStyle : undefined

  return {
    ...base,
    formats: [format],
    exportCategories: exp.categories.length > 0 ? exp.categories : base.exportCategories,
    exportCountries: exp.countries.length > 0 ? exp.countries : base.exportCountries,
    exportFrom: exp.from.length > 0 ? exp.from : base.exportFrom,
    exportStartDate: exp.startDate ?? base.exportStartDate,
    exportEndDate: exp.endDate ?? base.exportEndDate,
    exportMinScore: exp.minScore ?? base.exportMinScore,
    exportOnlyLocations: exp.onlyLocations || base.exportOnlyLocations,
    exportOnlyGeneric: exp.onlyGeneric || base.exportOnlyGeneric,
    exportMaxActivities: exp.maxActivities > 0 ? exp.maxActivities : base.exportMaxActivities,
    exportSort: exp.sort !== 'score' ? exp.sort : base.exportSort,
    pdfThumbnails: (pdf?.thumbnails ?? false) || base.pdfThumbnails,
    pdfIncludeScore: (pdf?.includeScore ?? false) || base.pdfIncludeScore,
    pdfGroupByCountry: pdf?.groupByCountry ?? true,
    pdfGroupByCategory: pdf?.groupByCategory ?? true,
    pdfPageSize: pdf?.pageSize ?? base.pdfPageSize,
    pdfTitle: pdf?.title ?? base.pdfTitle,
    pdfSubtitle: pdf?.subtitle ?? base.pdfSubtitle,
    mapDefaultStyle: mapStyle ?? base.mapDefaultStyle,
    exportOutput: typeof opts.output === 'string' ? opts.output : undefined,
    exportFormat: format
  }
}

function buildConfigCLIArgs(
  action: string | undefined,
  key: string | undefined,
  value: string | undefined,
  opts: Record<string, unknown>
): CLIArgs {
  const base = buildCLIArgs('config', '', opts)
  return {
    ...base,
    configAction: parseConfigAction(action),
    configKey: key,
    configValue: value
  }
}

/**
 * Attach action handlers for export command and its subcommands.
 */
function attachExportHandlers(program: Command, setResult: (args: CLIArgs) => void): void {
  const exportCmd = program.commands.find((c) => c.name() === 'export')
  if (!exportCmd) return

  // Handle export command without subcommand (acts as analyze alias)
  exportCmd.action((input?: string) => {
    if (input) {
      setResult(buildCLIArgs('export', input, exportCmd.optsWithGlobals()))
    }
  })

  // Handle export subcommands (pdf, json, csv, excel, map)
  for (const subCmd of exportCmd.commands) {
    const format = subCmd.name()
    subCmd.action((input: string) => {
      setResult(buildExportSubcommandArgs(format, input, subCmd.optsWithGlobals()))
    })
  }
}

/**
 * Attach action handlers for all commands.
 */
function attachActionHandlers(program: Command, setResult: (args: CLIArgs) => void): void {
  // Attach action handlers to capture parsed args
  for (const cmd of program.commands) {
    cmd.action((input: string) => {
      setResult(buildCLIArgs(cmd.name(), input ?? '', cmd.optsWithGlobals()))
    })
  }

  // Handle no-argument list command
  const listCmd = program.commands.find((c) => c.name() === 'list')
  if (listCmd) {
    listCmd.action(() => {
      setResult(buildCLIArgs('list', '', listCmd.optsWithGlobals()))
    })
  }

  // Handle config command with action, key, value arguments
  const configCmd = program.commands.find((c) => c.name() === 'config')
  if (configCmd) {
    configCmd.action((action?: string, key?: string, value?: string) => {
      setResult(buildConfigCLIArgs(action, key, value, configCmd.optsWithGlobals()))
    })
  }

  // Handle export command and its subcommands
  attachExportHandlers(program, setResult)
}

/**
 * Parse CLI arguments and return structured args.
 * Exits on --help or --version.
 */
export function parseCliArgs(): CLIArgs {
  const program = createProgram()

  let result: CLIArgs | null = null
  attachActionHandlers(program, (args) => {
    result = args
  })

  program.parse()

  if (!result) {
    program.help()
    process.exit(0)
  }

  return result
}

/**
 * Parse CLI arguments from an argv array (for testing).
 */
export function parseArgs(argv: string[], exitOnHelp = true): CLIArgs {
  const program = createProgram()

  if (!exitOnHelp) {
    program.exitOverride()
  }

  let result: CLIArgs | null = null
  attachActionHandlers(program, (args) => {
    result = args
  })

  try {
    program.parse(argv, { from: 'user' })
  } catch {
    // exitOverride throws on help/version
    if (!result) {
      return buildCLIArgs('help', '', {})
    }
  }

  return result ?? buildCLIArgs('help', '', {})
}
