#!/usr/bin/env bun
/**
 * Entity Resolution Test Script
 *
 * Standalone script for testing the search pipeline.
 * Usage: bun run scripts/resolve-entity.ts "The Matrix" --type movie
 */

import { parseArgs } from 'util'
import { FilesystemCache } from '../src/caching/filesystem'
import { resolveBook, resolveEntity, type EntityType, type ResolvedEntity } from '../src/search'

const VALID_ENTITY_TYPES: EntityType[] = [
  'movie',
  'tv_show',
  'web_series',
  'video_game',
  'physical_game',
  'book',
  'comic',
  'play',
  'album',
  'song',
  'podcast',
  'artist'
]

function formatEntityType(type: string): EntityType | null {
  const normalized = type.toLowerCase().replace(/-/g, '_')
  if (VALID_ENTITY_TYPES.includes(normalized as EntityType)) {
    return normalized as EntityType
  }
  return null
}

function formatResult(entity: ResolvedEntity): string {
  const lines: string[] = []

  lines.push(`✓ Found: ${entity.title}`)
  lines.push(`  ID: ${entity.id}`)
  lines.push(`  Source: ${entity.source}`)
  lines.push(`  Type: ${entity.type}`)
  lines.push(`  URL: ${entity.url}`)

  if (entity.year) {
    lines.push(`  Year: ${entity.year}`)
  }

  if (entity.description) {
    lines.push(`  Description: ${entity.description}`)
  }

  if (entity.imageUrl) {
    lines.push(`  Image: ${entity.imageUrl}`)
  }

  if (entity.wikipediaUrl) {
    lines.push(`  Wikipedia: ${entity.wikipediaUrl}`)
  }

  const externalIdKeys = Object.keys(entity.externalIds)
  if (externalIdKeys.length > 0) {
    lines.push(`  External IDs:`)
    for (const key of externalIdKeys) {
      const value = entity.externalIds[key as keyof typeof entity.externalIds]
      if (value) {
        lines.push(`    ${key}: ${value}`)
      }
    }
  }

  return lines.join('\n')
}

function printUsage(): void {
  console.log(`
Usage: bun run scripts/resolve-entity.ts <query> --type <type> [options]

Arguments:
  query                Entity name to resolve (e.g., "The Matrix")

Options:
  -t, --type <type>    Entity type (required)
  -a, --author <name>  Author name (for books)
  --json               Output as JSON
  --dry-run            Show what would be queried
  -h, --help           Show this help

Entity types:
  ${VALID_ENTITY_TYPES.join(', ')}

Examples:
  bun run scripts/resolve-entity.ts "The Matrix" --type movie
  bun run scripts/resolve-entity.ts "Pride and Prejudice" --type book --author "Jane Austen"

Environment variables:
  GOOGLE_PROGRAMMABLE_SEARCH_API_KEY  Google Custom Search API key
  GOOGLE_PROGRAMMABLE_SEARCH_CX       Custom search engine ID
  GOOGLE_AI_API_KEY                   Gemini API key (for AI disambiguation)
`)
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      type: { type: 'string', short: 't' },
      author: { type: 'string', short: 'a' },
      json: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false }
    },
    allowPositionals: true
  })

  if (values.help) {
    printUsage()
    process.exit(0)
  }

  const query = positionals[0]
  const typeArg = values.type
  const author = values.author
  const jsonOutput = values.json
  const dryRun = values['dry-run']

  if (!query) {
    console.error('Error: No query specified')
    printUsage()
    process.exit(1)
  }

  if (!typeArg) {
    console.error('Error: No type specified')
    printUsage()
    process.exit(1)
  }

  const entityType = formatEntityType(typeArg)
  if (!entityType) {
    console.error(`Error: Invalid type "${typeArg}"`)
    console.error(`Valid types: ${VALID_ENTITY_TYPES.join(', ')}`)
    process.exit(1)
  }

  console.log(`\n🔍 Resolving: "${query}" (${entityType})`)
  if (author) {
    console.log(`   Author: ${author}`)
  }

  // Set up cache
  const cacheDir = process.env.CHAT_TO_MAP_CACHE_DIR || `${process.env.HOME}/.cache/chat-to-map`
  const cache = new FilesystemCache(`${cacheDir}/requests`)

  // Build config from environment
  const googleApiKey = process.env.GOOGLE_PROGRAMMABLE_SEARCH_API_KEY
  const googleCx = process.env.GOOGLE_PROGRAMMABLE_SEARCH_CX
  const geminiApiKey = process.env.GOOGLE_AI_API_KEY

  const config = {
    wikidata: true,
    openlibrary: entityType === 'book',
    cache,
    googleSearch: googleApiKey && googleCx ? { apiKey: googleApiKey, cx: googleCx } : undefined,
    aiClassification: geminiApiKey ? { apiKey: geminiApiKey } : undefined
  }

  if (dryRun) {
    console.log('\n📊 Dry run: would query:')
    console.log(`   - Wikidata API (free)`)
    if (entityType === 'book') {
      console.log(`   - Open Library API (free)`)
    }
    if (config.googleSearch) {
      console.log(`   - Google Programmable Search API`)
    }
    if (config.aiClassification) {
      console.log(`   - Gemini AI for disambiguation`)
    }
    return
  }

  console.log('')

  let result: ResolvedEntity | null

  if (entityType === 'book' && author) {
    result = await resolveBook(query, author, config)
  } else {
    result = await resolveEntity(query, entityType, config)
  }

  if (result) {
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2))
    } else {
      console.log(formatResult(result))
    }
  } else {
    console.log('✗ Not found')
    console.log('')
    console.log('Try:')
    console.log('  - Check spelling')
    console.log('  - Use the full title')
    console.log('  - Add year for disambiguation (e.g., "The Matrix 1999")')
    if (entityType === 'book') {
      console.log('  - Add author with --author')
    }
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
