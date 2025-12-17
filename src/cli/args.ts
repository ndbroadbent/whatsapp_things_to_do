/**
 * CLI Argument Parsing
 *
 * Parse command line arguments for the CLI.
 */

import { VERSION } from '../index.js'
import type { ActivityCategory } from '../types.js'

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
}

export const HELP_TEXT = `
ChatToMap CLI v${VERSION}

Transform chat exports into interactive maps of activities and places.

USAGE:
  chat-to-map analyze <input> [options]
  chat-to-map parse <input> [options]
  chat-to-map extract <messages.json> [options]
  chat-to-map classify <candidates.json> [options]
  chat-to-map geocode <suggestions.json> [options]
  chat-to-map export <geocoded.json> [options]
  chat-to-map version
  chat-to-map help

COMMANDS:
  analyze    Run the complete pipeline (parse -> extract -> classify -> geocode -> export)
  parse      Parse a chat export file
  extract    Extract candidates from parsed messages
  classify   Classify candidates using AI
  geocode    Geocode classified suggestions
  export     Generate output files

OPTIONS:
  -o, --output-dir <dir>      Output directory (default: ./output)
  -f, --format <formats>      Output formats: csv,excel,json,map,pdf (default: all)
  -r, --region <code>         Region bias for geocoding (e.g., NZ, US)
  --min-confidence <0-1>      Minimum confidence threshold (default: 0.5)
  --activities-only           Exclude errands (activity_score > 0.5)
  --category <cat>            Filter by category
  --skip-geocoding            Skip geocoding step
  -q, --quiet                 Minimal output
  -v, --verbose               Verbose output
  --dry-run                   Parse only, show stats
  -h, --help                  Show this help

API KEYS (via environment variables):
  OPENAI_API_KEY              Required for embeddings (optional)
  ANTHROPIC_API_KEY           Required for classification
  GOOGLE_MAPS_API_KEY         Required for geocoding

EXAMPLES:
  # Analyze a WhatsApp export
  chat-to-map analyze "WhatsApp Chat.zip"

  # Parse and show stats only
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

function buildCliArgs(flags: Record<string, string | boolean>, positionals: string[]): CLIArgs {
  const command = positionals[0] ?? 'help'
  const input = positionals[1] ?? ''
  const outputDir = typeof flags['output-dir'] === 'string' ? flags['output-dir'] : './output'
  const format = typeof flags.format === 'string' ? flags.format : 'csv,excel,json,map,pdf'
  const region = typeof flags.region === 'string' ? flags.region : undefined
  const minConfStr = typeof flags['min-confidence'] === 'string' ? flags['min-confidence'] : '0.5'
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
    dryRun: flags['dry-run'] === true
  }
}

export function parseCliArgs(): CLIArgs {
  const args = process.argv.slice(2)
  const { flags, positionals } = extractFlagsAndPositionals(args)

  mapShortFlags(flags)
  handleSpecialCommands(positionals[0] ?? '', flags)

  return buildCliArgs(flags, positionals)
}
