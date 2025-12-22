/**
 * CLI Argument Parsing
 *
 * Uses commander for subcommand-based CLI with per-command options.
 */

import { Command } from 'commander'
import { VERSION } from '../index.js'

export type ExtractionMethod = 'heuristics' | 'embeddings' | 'both'

export interface CLIArgs {
  command: string
  input: string
  outputDir: string
  formats: string[]
  region: string | undefined
  minConfidence: number
  skipGeocoding: boolean
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
}

export const DEFAULT_BASE_DIR = './chat-to-map'
export const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/output`
export const DEFAULT_CACHE_DIR = `${DEFAULT_BASE_DIR}/cache`

function createProgram(): Command {
  const program = new Command()
    .name('chat-to-map')
    .description('Transform chat exports into interactive maps of activities and places.')
    .version(VERSION, '-V, --version', 'Show version number')

  // ============ ANALYZE (full pipeline - most common) ============
  program
    .command('analyze')
    .description(
      'Run the complete pipeline (parse → candidates → scrape → classify → geocode → export)'
    )
    .argument('<input>', 'Chat export file (.txt or .zip)')
    .requiredOption('-c, --home-country <name>', 'Your home country for location disambiguation')
    .option('--timezone <tz>', 'Your timezone, e.g. Pacific/Auckland')
    .option('-o, --output-dir <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
    .option(
      '-f, --format <formats>',
      'Output formats: csv,excel,json,map,pdf',
      'csv,excel,json,map,pdf'
    )
    .option('-r, --region <code>', 'Region bias for geocoding (e.g., NZ, US)')
    .option('--min-confidence <num>', 'Minimum confidence threshold', '0.5')
    .option('--skip-geocoding', 'Skip geocoding step')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')
    .option('--dry-run', 'Show stats without API calls')
    .option('--debug', 'Print debug info')

  // ============ PARSE ============
  program
    .command('parse')
    .description('Parse a chat export file and show stats')
    .argument('<input>', 'Chat export file (.txt or .zip)')
    .option('-o, --output <file>', 'Save parsed messages to JSON file')
    .option('-m, --max-messages <num>', 'Max messages to process')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')

  // ============ SCAN (heuristics only, free) ============
  program
    .command('scan')
    .description('Heuristic scan: show pattern matches (free, no API key)')
    .argument('<input>', 'Chat export file (.txt or .zip)')
    .option('-n, --max-results <num>', 'Max results to return', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')

  // ============ PREVIEW (AI on top heuristic candidates) ============
  program
    .command('preview')
    .description('AI-powered preview: classify top candidates (~$0.01)')
    .argument('<input>', 'Chat export file (.txt or .zip)')
    .requiredOption('-c, --home-country <name>', 'Your home country for location disambiguation')
    .option('--timezone <tz>', 'Your timezone, e.g. Pacific/Auckland')
    .option('-n, --max-results <num>', 'Max results to return', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')
    .option('--dry-run', 'Show stats without API calls')
    .option('--debug', 'Print debug info')

  // ============ CANDIDATES (heuristics + embeddings extraction) ============
  program
    .command('candidates')
    .description('Extract candidate messages (heuristics, embeddings, or both)')
    .argument('<input>', 'Chat export file (.txt or .zip)')
    .option('--method <method>', 'Extraction method: heuristics, embeddings, both', 'both')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--min-confidence <num>', 'Minimum confidence threshold', '0.5')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')
    .option('--dry-run', 'Show cost estimate without API calls')
    .option('--debug', 'Print debug info')

  // ============ SCRAPE (scrape URLs for metadata) ============
  program
    .command('scrape')
    .description('Scrape URLs from candidates and cache metadata')
    .argument('<input>', 'Chat export file (.txt or .zip) or candidates JSON file')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--concurrency <num>', 'Max concurrent scrapes', '5')
    .option('--timeout <ms>', 'Timeout per URL in ms', '4000')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')

  // ============ CLASSIFY ============
  program
    .command('classify')
    .description('Classify candidates using AI')
    .argument('<input>', 'Candidates JSON file from candidates command')
    .requiredOption('-c, --home-country <name>', 'Your home country for location disambiguation')
    .option('--timezone <tz>', 'Your timezone, e.g. Pacific/Auckland')
    .option('-o, --output <file>', 'Save classified activities to JSON file')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')
    .option('--debug', 'Print classifier prompt')

  // ============ GEOCODE ============
  program
    .command('geocode')
    .description('Geocode classified activities')
    .argument('<input>', 'Classified activities JSON file')
    .option('-r, --region <code>', 'Region bias for geocoding (e.g., NZ, US)')
    .option('-o, --output <file>', 'Save geocoded activities to JSON file')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')

  // ============ EXPORT ============
  program
    .command('export')
    .description('Generate output files from geocoded activities')
    .argument('<input>', 'Geocoded activities JSON file')
    .option('-o, --output-dir <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
    .option(
      '-f, --format <formats>',
      'Output formats: csv,excel,json,map,pdf',
      'csv,excel,json,map,pdf'
    )
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')

  // ============ LIST ============
  program
    .command('list')
    .description('Show previously processed chats')
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')

  return program
}

function parseMethod(value: unknown): ExtractionMethod {
  if (value === 'heuristics' || value === 'embeddings' || value === 'both') {
    return value
  }
  return 'both'
}

function buildCLIArgs(commandName: string, input: string, opts: Record<string, unknown>): CLIArgs {
  const format = typeof opts.format === 'string' ? opts.format : 'csv,excel,json,map,pdf'

  return {
    command: commandName,
    input,
    outputDir: typeof opts.outputDir === 'string' ? opts.outputDir : DEFAULT_OUTPUT_DIR,
    formats: format.split(',').map((f) => f.trim()),
    region: typeof opts.region === 'string' ? opts.region : undefined,
    minConfidence: Number.parseFloat(String(opts.minConfidence ?? '0.5')),
    skipGeocoding: opts.skipGeocoding === true,
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
    scrapeTimeout: Number.parseInt(String(opts.timeout ?? '4000'), 10)
  }
}

/**
 * Parse CLI arguments and return structured args.
 * Exits on --help or --version.
 */
export function parseCliArgs(): CLIArgs {
  const program = createProgram()

  let result: CLIArgs | null = null

  // Attach action handlers to capture parsed args
  for (const cmd of program.commands) {
    cmd.action((input: string, opts: Record<string, unknown>) => {
      result = buildCLIArgs(cmd.name(), input ?? '', opts)
    })
  }

  // Handle no-argument list command
  const listCmd = program.commands.find((c) => c.name() === 'list')
  if (listCmd) {
    listCmd.action((opts: Record<string, unknown>) => {
      result = buildCLIArgs('list', '', opts)
    })
  }

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

  for (const cmd of program.commands) {
    cmd.action((input: string, opts: Record<string, unknown>) => {
      result = buildCLIArgs(cmd.name(), input ?? '', opts)
    })
  }

  const listCmd = program.commands.find((c) => c.name() === 'list')
  if (listCmd) {
    listCmd.action((opts: Record<string, unknown>) => {
      result = buildCLIArgs('list', '', opts)
    })
  }

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
