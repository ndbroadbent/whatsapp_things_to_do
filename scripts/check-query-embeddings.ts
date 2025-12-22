#!/usr/bin/env bun
/**
 * Verify all query strings have pre-computed embeddings.
 * Fails if any query is missing from query-embeddings.json.gz.
 *
 * Usage: bun scripts/check-query-embeddings.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'

import activityTypes from '../src/extraction/embeddings/queries/activity-types.json'
import agreementQueries from '../src/extraction/embeddings/queries/agreement.json'
import suggestionQueries from '../src/extraction/embeddings/queries/suggestions.json'

// Load compressed embeddings
const embeddingsPath = join(import.meta.dir, '../src/extraction/embeddings/queries/query-embeddings.json.gz')
const compressed = readFileSync(embeddingsPath)
const jsonData = gunzipSync(compressed).toString()
const queryEmbeddings = JSON.parse(jsonData) as { queries: Array<{ text: string }> }

// Get all queries from source files
const allActivityTypes = Object.values(activityTypes).flat()
const allQueries = new Set([...suggestionQueries, ...agreementQueries, ...allActivityTypes])

// Get queries that have embeddings
const embeddedQueries = new Set(queryEmbeddings.queries.map((q) => q.text))

// Find missing
const missing: string[] = []
for (const query of allQueries) {
  if (!embeddedQueries.has(query)) {
    missing.push(query)
  }
}

// Find stale (in embeddings but not in source)
const stale: string[] = []
for (const query of embeddedQueries) {
  if (!allQueries.has(query)) {
    stale.push(query)
  }
}

if (missing.length > 0 || stale.length > 0) {
  console.error('❌ Query embeddings are out of sync!\n')

  if (missing.length > 0) {
    console.error(`Missing embeddings for ${missing.length} queries:`)
    for (const q of missing.slice(0, 10)) {
      console.error(`  - "${q}"`)
    }
    if (missing.length > 10) {
      console.error(`  ... and ${missing.length - 10} more`)
    }
  }

  if (stale.length > 0) {
    console.error(`\nStale embeddings for ${stale.length} removed queries:`)
    for (const q of stale.slice(0, 10)) {
      console.error(`  - "${q}"`)
    }
    if (stale.length > 10) {
      console.error(`  ... and ${stale.length - 10} more`)
    }
  }

  console.error('\nRun: bun scripts/generate-query-embeddings.ts')
  process.exit(1)
}

console.log(`✓ All ${allQueries.size} queries have embeddings`)
