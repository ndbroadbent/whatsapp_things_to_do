/**
 * CLI Command Definitions
 *
 * Defines all subcommands and their options using Commander.
 */

import { Command } from 'commander'
import { VERSION } from '../index'
import { getConfigDescription, getConfigType, getValidConfigKeys } from './config'

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

/**
 * Add common filter options (unprefixed) to export subcommands.
 */
function addFilterOptions(cmd: Command): Command {
  return cmd
    .option('--categories <list>', 'Filter by categories (comma-separated)')
    .option('--countries <list>', 'Filter by countries (comma-separated)')
    .option('--from <list>', 'Filter by sender names (comma-separated)')
    .option('--start-date <date>', 'Filter to on/after date (YYYY-MM-DD)')
    .option('--end-date <date>', 'Filter to on/before date (YYYY-MM-DD)')
    .option('--min-score <num>', 'Min score (0-3)')
    .option('--only-locations', 'Only activities with specific locations')
    .option('--only-generic', 'Only generic activities without locations')
    .option('--max-activities <num>', 'Max activities, 0 for all')
    .option('--sort <order>', 'Sort order: score, oldest, newest', 'score')
}

/**
 * Add common export options (prefixed with --export-*) to parent commands.
 */
function addPrefixedExportOptions(cmd: Command): Command {
  return cmd
    .option('--export-categories <list>', 'Filter ALL exports by categories (comma-separated)')
    .option('--export-countries <list>', 'Filter ALL exports by countries (comma-separated)')
    .option('--export-from <list>', 'Filter ALL exports by sender names (comma-separated)')
    .option('--export-start-date <date>', 'Filter ALL exports to on/after date (YYYY-MM-DD)')
    .option('--export-end-date <date>', 'Filter ALL exports to on/before date (YYYY-MM-DD)')
    .option('--export-min-score <num>', 'Min score for ALL exports (0-3)')
    .option('--export-only-locations', 'Only export activities with specific locations')
    .option('--export-only-generic', 'Only export generic activities without locations')
    .option('--export-max-activities <num>', 'Max activities in ALL exports, 0 for all')
    .option('--export-sort <order>', 'Sort for ALL exports: score, oldest, newest', 'score')
}

/**
 * Add PDF-specific options (prefixed with --pdf-*) to parent commands.
 */
function addPrefixedPdfOptions(cmd: Command): Command {
  return cmd
    .option('--pdf-thumbnails', 'Include thumbnails in PDF (uses more ink when printing)')
    .option('--pdf-include-score', 'Show score in PDF output')
    .option('--pdf-group-by-country', 'Group by country in PDF (default: true)')
    .option('--pdf-no-group-by-country', 'Do not group by country in PDF')
    .option('--pdf-group-by-category', 'Group by category in PDF (default: true)')
    .option('--pdf-no-group-by-category', 'Do not group by category in PDF')
    .option('--pdf-page-size <size>', 'PDF page size: A4 or Letter (default: based on country)')
    .option('--pdf-title <title>', 'Custom PDF title')
    .option('--pdf-subtitle <subtitle>', 'Custom PDF subtitle')
    .option('--pdf-categories <list>', 'Filter PDF by categories (overrides --export-categories)')
    .option('--pdf-countries <list>', 'Filter PDF by countries (overrides --export-countries)')
    .option('--pdf-from <list>', 'Filter PDF by sender names (overrides --export-from)')
    .option(
      '--pdf-start-date <date>',
      'Filter PDF to on/after date (overrides --export-start-date)'
    )
    .option('--pdf-end-date <date>', 'Filter PDF to on/before date (overrides --export-end-date)')
    .option('--pdf-min-score <num>', 'Min score for PDF (overrides --export-min-score)')
    .option('--pdf-only-locations', 'Only locations in PDF (overrides --export-only-locations)')
    .option('--pdf-only-generic', 'Only generic in PDF (overrides --export-only-generic)')
    .option(
      '--pdf-max-activities <num>',
      'Max activities in PDF (overrides --export-max-activities)'
    )
    .option('--pdf-sort <order>', 'Sort for PDF: score, oldest, newest (overrides --export-sort)')
}

/**
 * Add common options for classify and place-lookup commands.
 */
function addClassifyOptions(cmd: Command): Command {
  return cmd
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('-n, --max-results <num>', 'Max results to display', '10')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('-a, --all', 'Show all activities (default: top 10)')
    .option('--dry-run', 'Show stats without API calls')
}

/**
 * Add common pipeline options shared by analyze and export commands.
 */
function addPipelineOptions(cmd: Command): Command {
  return cmd
    .option('-c, --home-country <name>', 'Your home country (auto-detected from IP if not set)')
    .option('--timezone <tz>', 'Your timezone (auto-detected from system if not set)')
    .option('-o, --output-dir <dir>', 'Output directory', DEFAULT_OUTPUT_DIR)
    .option(
      '-f, --format <formats>',
      'Output formats: csv,excel,json,map,pdf',
      'csv,excel,json,map,pdf'
    )
    .option('--min-confidence <num>', 'Minimum confidence threshold', '0.5')
    .option('--skip-place-lookup', 'Skip place lookup step')
    .option('--images', 'Fetch images for activities (slower, uses external APIs)')
    .option(
      '--media-library-path <path>',
      'Local path to media library images (development/offline)'
    )
    .option('--map-default-style <style>', 'Default map tile style (e.g. osm, satellite, terrain)')
    .option('-m, --max-messages <num>', 'Max messages to process (for testing)')
    .option('--dry-run', 'Show stats without API calls')
}

/**
 * Add export command with subcommands.
 */
function addExportCommand(program: Command): void {
  const baseExportCmd = program
    .command('export')
    .description(
      `Export activities to various formats (or run full pipeline without subcommand)

Examples:
  $ chat-to-map export pdf chat.zip                    # Export to PDF
  $ chat-to-map export pdf chat.zip --thumbnails      # PDF with images
  $ chat-to-map export json chat.zip -o results.json  # Custom output path
  $ chat-to-map export csv chat.zip --countries "NZ"  # Filter by country
  $ chat-to-map export map chat.zip --only-locations  # Only mappable activities`
    )
    .argument('[input]', 'Chat export (.zip, directory, or .txt file)')

  // Add pipeline + prefixed export + PDF options
  const exportCommand = addPrefixedPdfOptions(
    addPrefixedExportOptions(addPipelineOptions(baseExportCmd))
  )

  // export pdf - with PDF-specific options (unprefixed)
  addFilterOptions(
    exportCommand
      .command('pdf')
      .description('Export activities to PDF')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
      .option('-o, --output <file>', 'Output file path')
  )
    .option('--thumbnails', 'Include thumbnails in PDF')
    .option('--include-score', 'Show score in PDF output')
    .option('--group-by-country', 'Group by country (default: true)')
    .option('--no-group-by-country', 'Do not group by country')
    .option('--group-by-category', 'Group by category (default: true)')
    .option('--no-group-by-category', 'Do not group by category')
    .option('--page-size <size>', 'Page size: A4 or Letter (default: based on country)')
    .option('--title <title>', 'Custom PDF title')
    .option('--subtitle <subtitle>', 'Custom PDF subtitle')

  // export json
  addFilterOptions(
    exportCommand
      .command('json')
      .description('Export activities to JSON')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
      .option('-o, --output <file>', 'Output file path')
  )

  // export csv
  addFilterOptions(
    exportCommand
      .command('csv')
      .description('Export activities to CSV')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
      .option('-o, --output <file>', 'Output file path')
  )

  // export excel
  addFilterOptions(
    exportCommand
      .command('excel')
      .description('Export activities to Excel')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
      .option('-o, --output <file>', 'Output file path')
  )

  // export map - with map-specific options
  addFilterOptions(
    exportCommand
      .command('map')
      .description('Export activities to interactive HTML map')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
      .option('-o, --output <file>', 'Output file path')
  ).option('--default-style <style>', 'Default map tile style (e.g. osm, satellite, terrain)')
}

/**
 * Create the CLI program with all commands.
 */
export function createProgram(): Command {
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
  const baseAnalyzeCmd = program
    .command('analyze')
    .description(
      'Run the complete pipeline (parse → filter → scrape-urls → classify → place-lookup → export)'
    )
    .argument('<input>', 'Chat export (.zip, directory, or .txt file)')

  // Add pipeline + prefixed export + PDF options
  addPrefixedPdfOptions(addPrefixedExportOptions(addPipelineOptions(baseAnalyzeCmd)))

  // ============ EXPORT (parent command with subcommands) ============
  addExportCommand(program)

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
  addClassifyOptions(
    program
      .command('classify')
      .description('Classify candidates into activities using AI')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
  )

  // ============ PLACE-LOOKUP ============
  addClassifyOptions(
    program
      .command('place-lookup')
      .description('Look up places for classified activities using Google Maps API')
      .argument('<input>', 'Chat export (.zip, directory, or .txt file)')
  )

  // ============ FETCH-IMAGE-URLS ============
  program
    .command('fetch-image-urls')
    .description('Fetch image URLs for geocoded activities')
    .argument('<input>', 'Chat export file or directory')
    .option('--json [file]', 'Output as JSON (to file if specified, otherwise stdout)')
    .option('--no-media-library', 'Skip media library images')
    .option('--skip-pixabay', 'Skip Pixabay image search')
    .option('--skip-wikipedia', 'Skip Wikipedia image lookup')
    .option('--skip-google-places', 'Skip Google Places photos')
    .option(
      '--media-library-path <path>',
      'Local path to media library images (development/offline)'
    )
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
    .description('Manage configuration')
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
