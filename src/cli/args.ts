/**
 * CLI Argument Parsing
 *
 * Parse command line arguments for the CLI.
 */

import { VERSION } from '../index.js'
import type { ActivityCategory } from '../types.js'

export type ExtractionMethod = 'heuristics' | 'embeddings' | 'both'

export interface CLIArgs {
  command: string
  input: string
  outputDir: string
  formats: string[]
  region: string | undefined
  minConfidence: number
  activitiesOnly: boolean
  category: ActivityCategory | undefined
  skipGeocoding: boolean
  quiet: boolean
  verbose: boolean
  dryRun: boolean
  debug: boolean
  maxResults: number
  maxMessages: number | undefined
  /** For candidates command: extraction method */
  method: ExtractionMethod
  /** For candidates command: JSON output path */
  jsonOutput: string | undefined
}

/**
 * Default base directory for chat-to-map data.
 */
export const DEFAULT_BASE_DIR = './chat-to-map'

/**
 * Default output directory under the base directory.
 */
export const DEFAULT_OUTPUT_DIR = `${DEFAULT_BASE_DIR}/output`

/**
 * Default cache directory under the base directory.
 */
export const DEFAULT_CACHE_DIR = `${DEFAULT_BASE_DIR}/cache`

export const HELP_TEXT = `
ChatToMap CLI v${VERSION}

Transform chat exports into interactive maps of activities and places.

USAGE:
  chat-to-map analyze <input> [options]
  chat-to-map preview <input> [options]
  chat-to-map scan <input> [options]
  chat-to-map candidates <input> [options]
  chat-to-map list [options]
  chat-to-map parse <input> [options]
  chat-to-map classify <candidates.json> [options]
  chat-to-map geocode <suggestions.json> [options]
  chat-to-map export <geocoded.json> [options]
  chat-to-map version
  chat-to-map help

COMMANDS:
  analyze    Run the complete pipeline (parse -> extract -> classify -> geocode -> export)
  preview    AI-powered preview: classify top candidates (requires API key, ~$0.01)
  scan       Heuristic scan: show pattern matches (no API key needed, free)
  candidates Debug candidate extraction (heuristics, embeddings, or both)
  list       Show previously processed chats
  parse      Parse a chat export file
  classify   Classify candidates using AI
  geocode    Geocode classified suggestions
  export     Generate output files

OPTIONS:
  -o, --output-dir <dir>      Output directory (default: ./chat-to-map/output)
  -f, --format <formats>      Output formats: csv,excel,json,map,pdf (default: all)
  -r, --region <code>         Region bias for geocoding (e.g., NZ, US)
  -n, --max-results <num>     Max results to return (default: 10 for preview/scan)
  -m, --max-messages <num>    Max messages to process (for testing)
  --min-confidence <0-1>      Minimum confidence threshold (default: 0.5)
  --activities-only           Exclude errands (activity_score > 0.5)
  --category <cat>            Filter by category
  --skip-geocoding            Skip geocoding step
  --method <method>           Extraction method: heuristics, embeddings, both (default: both)
  --json <file>               Output candidates to JSON file instead of stdout
  -q, --quiet                 Minimal output
  -v, --verbose               Verbose output
  --dry-run                   Skip API calls
  --debug                     Print debug info (e.g., classifier prompt)
  -h, --help                  Show this help

API KEYS (via environment variables):
  OPENAI_API_KEY              Required for embeddings (optional)
  ANTHROPIC_API_KEY           Required for classification
  GOOGLE_MAPS_API_KEY         Required for geocoding

EXAMPLES:
  # Heuristic scan - see what patterns match (free, no API key)
  chat-to-map scan "WhatsApp Chat.zip"

  # AI preview - classify top candidates (requires API key, ~$0.01)
  chat-to-map preview "WhatsApp Chat.zip"
  chat-to-map preview "WhatsApp Chat.zip" -n 5   # Max 5 results
  chat-to-map preview "WhatsApp Chat.zip" -m 100 # Process first 100 messages only

  # Full analysis (requires API key, ~$1-2)
  chat-to-map analyze "WhatsApp Chat.zip"

  # Debug candidate extraction
  chat-to-map candidates "WhatsApp Chat.zip"                    # Both methods
  chat-to-map candidates "WhatsApp Chat.zip" --method heuristics # Heuristics only
  chat-to-map candidates "WhatsApp Chat.zip" --json output.json  # Save to file

  # List previously processed chats
  chat-to-map list

  # Parse and show stats only (no API calls)
  chat-to-map analyze chat.txt --dry-run

  # Custom output directory and formats
  chat-to-map analyze chat.txt -o ./results -f csv,map

  # Filter to activities in NZ
  chat-to-map analyze chat.txt -r NZ --activities-only
`

interface ParsedFlags {
  flags: Record<string, string | boolean>
  positionals: string[]
}

function parseFlag(
  arg: string,
  nextArg: string | undefined,
  flags: Record<string, string | boolean>
): boolean {
  const isLongFlag = arg.startsWith('--')
  const key = isLongFlag ? arg.slice(2) : arg.slice(1)
  const hasValue = nextArg !== undefined && !nextArg.startsWith('-')

  flags[key] = hasValue ? nextArg : true
  return hasValue
}

function extractFlagsAndPositionals(args: string[]): ParsedFlags {
  const flags: Record<string, string | boolean> = {}
  const positionals: string[] = []

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg) continue

    if (arg.startsWith('-')) {
      const skippedNext = parseFlag(arg, args[i + 1], flags)
      if (skippedNext) i++
    } else {
      positionals.push(arg)
    }
  }

  return { flags, positionals }
}

function mapShortFlags(flags: Record<string, string | boolean>): void {
  const shortToLong: Record<string, string> = {
    o: 'output-dir',
    f: 'format',
    r: 'region',
    n: 'max-results',
    m: 'max-messages',
    q: 'quiet',
    v: 'verbose',
    h: 'help'
  }

  for (const [short, long] of Object.entries(shortToLong)) {
    if (flags[short]) flags[long] = flags[short]
  }
}

function handleSpecialCommands(command: string, flags: Record<string, string | boolean>): void {
  if (flags.help || command === 'help' || !command) {
    console.log(HELP_TEXT)
    process.exit(0)
  }

  if (command === 'version') {
    console.log(`ChatToMap CLI v${VERSION}`)
    process.exit(0)
  }
}

function parseMethod(value: unknown): ExtractionMethod {
  if (value === 'heuristics' || value === 'embeddings' || value === 'both') {
    return value
  }
  return 'both'
}

function buildCliArgs(flags: Record<string, string | boolean>, positionals: string[]): CLIArgs {
  const command = positionals[0] ?? 'help'
  const input = positionals[1] ?? ''
  const outputDir =
    typeof flags['output-dir'] === 'string' ? flags['output-dir'] : DEFAULT_OUTPUT_DIR
  const format = typeof flags.format === 'string' ? flags.format : 'csv,excel,json,map,pdf'
  const region = typeof flags.region === 'string' ? flags.region : undefined
  const minConfStr = typeof flags['min-confidence'] === 'string' ? flags['min-confidence'] : '0.5'
  const maxResultsStr = typeof flags['max-results'] === 'string' ? flags['max-results'] : '10'
  const maxMessagesStr =
    typeof flags['max-messages'] === 'string' ? flags['max-messages'] : undefined
  const category =
    typeof flags.category === 'string' ? (flags.category as ActivityCategory) : undefined

  return {
    command,
    input,
    outputDir,
    formats: format.split(',').map((f) => f.trim()),
    region,
    minConfidence: Number.parseFloat(minConfStr),
    activitiesOnly: flags['activities-only'] === true,
    category,
    skipGeocoding: flags['skip-geocoding'] === true,
    quiet: flags.quiet === true,
    verbose: flags.verbose === true,
    dryRun: flags['dry-run'] === true,
    debug: flags.debug === true,
    maxResults: Number.parseInt(maxResultsStr, 10),
    maxMessages: maxMessagesStr ? Number.parseInt(maxMessagesStr, 10) : undefined,
    method: parseMethod(flags.method),
    jsonOutput: typeof flags.json === 'string' ? flags.json : undefined
  }
}

/**
 * Parse CLI arguments from an argv array.
 * This function is testable since it takes argv as a parameter.
 *
 * @param argv - Command line arguments (without node/script path)
 * @param exitOnHelp - If true, print help and exit. If false, return help command args.
 */
export function parseArgs(argv: string[], exitOnHelp = true): CLIArgs {
  const { flags, positionals } = extractFlagsAndPositionals(argv)

  mapShortFlags(flags)

  if (exitOnHelp) {
    handleSpecialCommands(positionals[0] ?? '', flags)
  }

  return buildCliArgs(flags, positionals)
}

/**
 * Parse CLI arguments from process.argv.
 * Convenience wrapper for parseArgs that reads from process.argv.
 */
export function parseCliArgs(): CLIArgs {
  return parseArgs(process.argv.slice(2))
}
