/**
 * CLI Argument Parsing
 *
 * Uses commander for subcommand-based CLI with per-command options.
 */

import { Command } from 'commander'
import { VERSION } from '../index'

export type ExtractionMethod = 'heuristics' | 'embeddings' | 'both'

export interface CLIArgs {
  command: string
  input: string
  outputDir: string
  formats: string[]
  minConfidence: number
  skipGeocoding: boolean
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
  showAll: boolean
}

const DEFAULT_BASE_DIR = './chat-to-map'
const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/output`

const DESCRIPTION = `Transform chat exports into interactive maps of activities and places.

Supported formats (auto-detected):
  • WhatsApp iOS (.zip export)
  • WhatsApp Android (.zip export)
  • iMessage (via imessage-exporter)

Examples:
  $ chat-to-map parse "WhatsApp Chat.zip"
  $ chat-to-map scan ./imessage-export/
  $ chat-to-map analyze "WhatsApp Chat.zip"
  $ chat-to-map analyze ./imessage-export/

For iMessage, use imessage-exporter (https://github.com/ReagentX/imessage-exporter)
to export your chat, then point chat-to-map at the output directory.`

function createProgram(): Command {
  const program = new Command()
    .name('chat-to-map')
    .description(DESCRIPTION)
    .version(VERSION, '-V, --version', 'Show version number')
    // Global options inherited by all subcommands
    .option('-q, --quiet', 'Minimal output')
    .option('-v, --verbose', 'Verbose output')
    .option('--debug', 'Print debug info')
    .option('--no-cache', 'Skip cache and regenerate all results')
    .option('--cache-dir <dir>', 'Custom cache directory (or set CHAT_TO_MAP_CACHE_DIR)')

  // ============ ANALYZE (full pipeline - most common) ============
  program
    .command('analyze')
    .description(
      'Run the complete pipeline (parse → filter → scrape → classify → geocode → fetch-images → export)'
    )
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('-o, --output-dir <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
    .option(
      '-f, --format <formats>',
      'Output formats: csv,excel,json,map,pdf',
      'csv,excel,json,map,pdf'
    )
    .option('--min-confidence <num>', 'Minimum confidence threshold', '0.5')
    .option('--skip-geocoding', 'Skip geocoding step')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('--dry-run', 'Show stats without API calls')

  // ============ PARSE ============
  program
    .command('parse')
    .description(
      'Parse and validate a chat export: check format, count messages, list participants'
    )
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('-m, --max-messages <num>', 'Max messages to process')

  // ============ SCAN (heuristics only, free) ============
  program
    .command('scan')
    .description('Heuristic scan: show pattern matches (free, no API key)')
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('-n, --max-results <num>', 'Max results to return', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')

  // ============ PREVIEW (AI on top heuristic candidates) ============
  program
    .command('preview')
    .description('AI-powered preview: classify top candidates (~$0.01)')
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('-n, --max-results <num>', 'Max results to return', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('--dry-run', 'Show stats without API calls')

  // ============ EMBED (embed all messages) ============
  program
    .command('embed')
    .description('Embed all messages for semantic search using OpenAI API (~$0.001/1000 msgs)')
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('--dry-run', 'Show cost estimate without API calls')

  // ============ FILTER (heuristics + embeddings extraction) ============
  program
    .command('filter')
    .description('Filter messages into candidates (heuristics and semantic search via embeddings)')
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('--method <method>', 'Extraction method: heuristics, embeddings, both', 'both')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--min-confidence <num>', 'Minimum confidence threshold', '0.5')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-a, --all', 'Show all candidates (default: top 10)')
    .option('--dry-run', 'Show cost estimate without API calls')

  // ============ SCRAPE (scrape URLs for metadata) ============
  program
    .command('scrape')
    .description('Scrape URLs from candidates and cache metadata')
    .argument('<input>', 'Chat export file (.txt or .zip) or candidates JSON file')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--concurrency <num>', 'Max concurrent scrapes', '5')
    .option('--timeout <ms>', 'Timeout per URL in ms', '4000')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')

  // ============ CLASSIFY ============
  program
    .command('classify')
    .description('Classify candidates using AI')
    .argument('<input>', 'Candidates JSON file from filter command')
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('-o, --output <file>', 'Save classified activities to JSON file')

  // ============ GEOCODE ============
  program
    .command('geocode')
    .description('Geocode classified activities')
    .argument('<input>', 'Classified activities JSON file')
    .option('-c, --home-country <name>', 'Your home country for location disambiguation')
    .option('-o, --output <file>', 'Save geocoded activities to JSON file')

  // ============ FETCH-IMAGES ============
  program
    .command('fetch-images')
    .description('Fetch images for geocoded activities')
    .argument('<input>', 'Geocoded activities JSON file')
    .option('-o, --output <file>', 'Save activities with images to JSON file')
    .option('--skip-pixabay', 'Skip Pixabay image search')
    .option('--skip-wikipedia', 'Skip Wikipedia image lookup')
    .option('--skip-google-places', 'Skip Google Places photos')

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

  // ============ LIST ============
  program.command('list').description('Show previously processed chats')

  return program as Command
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
    minConfidence: Number.parseFloat(String(opts.minConfidence ?? '0.5')),
    skipGeocoding: opts.skipGeocoding === true,
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
    showAll: opts.all === true
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
  // Use optsWithGlobals() to include global options from parent program
  for (const cmd of program.commands) {
    cmd.action((input: string) => {
      result = buildCLIArgs(cmd.name(), input ?? '', cmd.optsWithGlobals())
    })
  }

  // Handle no-argument list command
  const listCmd = program.commands.find((c) => c.name() === 'list')
  if (listCmd) {
    listCmd.action(() => {
      result = buildCLIArgs('list', '', listCmd.optsWithGlobals())
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
    cmd.action((input: string) => {
      result = buildCLIArgs(cmd.name(), input ?? '', cmd.optsWithGlobals())
    })
  }

  const listCmd = program.commands.find((c) => c.name() === 'list')
  if (listCmd) {
    listCmd.action(() => {
      result = buildCLIArgs('list', '', listCmd.optsWithGlobals())
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
