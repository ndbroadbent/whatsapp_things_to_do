#!/usr/bin/env bun
/**
 * ChatToMap CLI
 *
 * Command-line orchestrator for the core library.
 *
 * @license AGPL-3.0
 */

// TODO: Implement CLI
// See project/PRD_CLI.md for full specification

const VERSION = '0.0.1'

function printHelp(): void {
  console.log(`
ChatToMap v${VERSION}

Usage:
  chat-to-map analyze <input.zip> [options]
  chat-to-map parse <input.zip>
  chat-to-map extract <messages.json>
  chat-to-map classify <candidates.json>
  chat-to-map geocode <suggestions.json>
  chat-to-map export <geocoded.json>
  chat-to-map config <subcommand>
  chat-to-map version
  chat-to-map help

Options:
  --output-dir, -o    Output directory (default: ./output)
  --format, -f        Output formats: csv,excel,json,map,pdf (default: all)
  --region, -r        Region bias for geocoding (e.g., NZ, US)
  --parallel, -p      Number of parallel workers (default: 4)
  --quiet, -q         Minimal output
  --verbose, -v       Verbose output
  --help, -h          Show help

API Keys (or use environment variables):
  --openai-key        OPENAI_API_KEY
  --anthropic-key     ANTHROPIC_API_KEY
  --google-maps-key   GOOGLE_MAPS_API_KEY

Examples:
  chat-to-map analyze "WhatsApp Chat - Partner.zip"
  chat-to-map analyze chat.zip -o ./results --region NZ
  chat-to-map analyze chat.zip --activities-only

For more information, see: https://github.com/DocSpring/chat_to_map
`)
}

function printVersion(): void {
  console.log(`chat-to-map v${VERSION}`)
}

function main(): void {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp()
    process.exit(0)
  }

  if (args.includes('--version') || args[0] === 'version') {
    printVersion()
    process.exit(0)
  }

  const command = args[0]

  switch (command) {
    case 'analyze':
    case 'parse':
    case 'extract':
    case 'classify':
    case 'geocode':
    case 'export':
    case 'config':
      console.error(`Command '${command}' not yet implemented.`)
      console.error('See project/PRD_CLI.md for the full specification.')
      process.exit(1)
      break
    case 'help':
      printHelp()
      break
    default:
      console.error(`Unknown command: ${command}`)
      console.error('Run "chat-to-map help" for usage.')
      process.exit(1)
  }
}

main()
