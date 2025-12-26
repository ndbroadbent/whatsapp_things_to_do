/**
 * CLI Argument Parsing
 *
 * Uses commander for subcommand-based CLI with per-command options.
 */

import { Command } from 'commander'
import { VERSION } from '../index'
import { getConfigDescription, getConfigType, getValidConfigKeys } from './config'

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
  /** For config command: action (list, set, unset) */
  configAction: 'list' | 'set' | 'unset'
  /** For config command: key name */
  configKey: string | undefined
  /** For config command: value to set */
  configValue: string | undefined
}

const DEFAULT_BASE_DIR = './chat-to-map'
const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/output`

const DESCRIPTION = `Transform chat exports into interactive maps of activities and places.

Supported formats (auto-detected):
  • WhatsApp iOS/Android (.zip export)
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
    .option('--config-file <path>', 'Config file path (or set CHAT_TO_MAP_CONFIG)')

  // ============ ANALYZE (full pipeline - most common) ============
  program
    .command('analyze')
    .description(
      'Run the complete pipeline (parse → filter → scrape-urls → classify → geocode → export)'
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
    .option('--images', 'Fetch images for activities (slower, uses external APIs)')
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

  // ============ SCRAPE-URLS (scrape URLs for metadata) ============
  program
    .command('scrape-urls')
    .description('Scrape URLs from candidates and cache metadata')
    .argument('<input>', 'Chat export file (.txt or .zip) or candidates JSON file')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--concurrency <num>', 'Max concurrent scrapes', '5')
    .option('--timeout <ms>', 'Timeout per URL in ms', '4000')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-a, --all', 'Show all enriched URLs (default: first 10)')
    .option('--dry-run', 'Show URL count without scraping')

  // ============ CLASSIFY ============
  program
    .command('classify')
    .description('Classify candidates into activities using AI')
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('-n, --max-results <num>', 'Max results to display', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-a, --all', 'Show all activities (default: top 10)')
    .option('--dry-run', 'Show stats without API calls')

  // ============ GEOCODE ============
  program
    .command('geocode')
    .description('Geocode classified activities using Google Maps API')
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('-n, --max-results <num>', 'Max results to display', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-a, --all', 'Show all geocoded activities (default: top 10)')
    .option('--dry-run', 'Show stats without API calls')

  // ============ FETCH-IMAGE-URLS ============
  program
    .command('fetch-image-urls')
    .description('Fetch image URLs for geocoded activities')
    .argument('<input>', 'Chat export file or directory')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--no-image-cdn', 'Skip CDN default images (fetch all from APIs)')
    .option('--skip-pixabay', 'Skip Pixabay image search')
    .option('--skip-wikipedia', 'Skip Wikipedia image lookup')
    .option('--skip-google-places', 'Skip Google Places photos')
    .option('-n, --max-results <num>', 'Max results to display', '10')
    .option('-a, --all', 'Show all activities with images')

  // ============ FETCH-IMAGES ============
  program
    .command('fetch-images')
    .description('Download and resize images to thumbnails for PDF export')
    .argument('<input>', 'Chat export file or directory')
    .option('-n, --max-results <num>', 'Max results to display', '10')
    .option('-a, --all', 'Show all thumbnails')

  // ============ LIST ============
  program.command('list').description('Show previously processed chats')

  // ============ CONFIG ============
  const configKeys = getValidConfigKeys()
  const maxLen = Math.max(...configKeys.map((k) => `${k} (${getConfigType(k)})`.length))
  const settingsHelp = configKeys
    .map((key) => {
      const label = `${key} (${getConfigType(key)})`
      return `  ${label.padEnd(maxLen)}  ${getConfigDescription(key)}`
    })
    .join('\n')
  program
    .command('config')
    .description('Manage persistent settings')
    .argument('[action]', 'Action: list (default), set, unset')
    .argument('[key]', 'Config key to set/unset')
    .argument('[value]', 'Value to set')
    .addHelpText(
      'after',
      `
Available settings:
${settingsHelp}

Examples:
  chat-to-map config                          List current settings
  chat-to-map config set homeCountry "USA"    Set home country
  chat-to-map config set fetchImages true     Enable image fetching
  chat-to-map config unset cacheDir           Remove custom cache dir`
    )

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
    configAction: 'list',
    configKey: undefined,
    configValue: undefined
  }
}

function parseConfigAction(action: string | undefined): 'list' | 'set' | 'unset' {
  if (action === 'set' || action === 'unset') {
    return action
  }
  return 'list'
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

  // Handle config command with action, key, value arguments
  const configCmd = program.commands.find((c) => c.name() === 'config')
  if (configCmd) {
    configCmd.action((action?: string, key?: string, value?: string) => {
      result = buildConfigCLIArgs(action, key, value, configCmd.optsWithGlobals())
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

  const configCmd = program.commands.find((c) => c.name() === 'config')
  if (configCmd) {
    configCmd.action((action?: string, key?: string, value?: string) => {
      result = buildConfigCLIArgs(action, key, value, configCmd.optsWithGlobals())
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
