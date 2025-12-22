#!/usr/bin/env bun
/**
 * Generate pre-computed embeddings for all query strings.
 * Run this once when queries change, commit the output.
 *
 * Usage: bun scripts/generate-query-embeddings.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

// Load queries
import activityTypes from '../src/extraction/embeddings/queries/activity-types.json'
import agreementQueries from '../src/extraction/embeddings/queries/agreement.json'
import suggestionQueries from '../src/extraction/embeddings/queries/suggestions.json'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
if (!OPENAI_API_KEY) {
  console.error('Error: OPENAI_API_KEY environment variable required')
  console.error('Set it in .env or export it')
  process.exit(1)
}

const MODEL = 'text-embedding-3-large'

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>
  model: string
  usage: { prompt_tokens: number; total_tokens: number }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, input: texts })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenAI API error: ${response.status} ${error}`)
  }

  const data = (await response.json()) as OpenAIEmbeddingResponse
  
  // Sort by index and return embeddings
  const embeddings: number[][] = new Array(texts.length)
  for (const item of data.data) {
    embeddings[item.index] = item.embedding
  }
  
  return embeddings
}

async function main() {
  console.log('Generating query embeddings...\n')

  // Flatten all queries
  const allActivityTypes = Object.values(activityTypes).flat()
  const allQueries = [...suggestionQueries, ...agreementQueries, ...allActivityTypes]

  console.log(`Suggestion queries: ${suggestionQueries.length}`)
  console.log(`Agreement queries: ${agreementQueries.length}`)
  console.log(`Activity types: ${allActivityTypes.length}`)
  console.log(`Total queries: ${allQueries.length}\n`)

  // Embed in batches of 100
  const BATCH_SIZE = 100
  const allEmbeddings: number[][] = []
  
  for (let i = 0; i < allQueries.length; i += BATCH_SIZE) {
    const batch = allQueries.slice(i, i + BATCH_SIZE)
    console.log(`Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allQueries.length / BATCH_SIZE)}...`)
    
    const embeddings = await embedBatch(batch)
    allEmbeddings.push(...embeddings)
  }

  // Build output structure
  const output = {
    model: MODEL,
    generatedAt: new Date().toISOString(),
    queryCount: allQueries.length,
    dimensions: allEmbeddings[0]?.length ?? 0,
    queries: allQueries.map((query, i) => ({
      text: query,
      embedding: allEmbeddings[i]
    }))
  }

  // Write compressed file
  const outputPath = join(import.meta.dir, '../src/extraction/embeddings/queries/query-embeddings.json.gz')
  const jsonData = JSON.stringify(output)
  const compressed = gzipSync(jsonData)
  writeFileSync(outputPath, compressed)

  const sizeMB = (compressed.length / 1024 / 1024).toFixed(1)
  console.log(`\nWritten ${allQueries.length} embeddings to:`)
  console.log(outputPath)
  console.log(`\nDimensions: ${output.dimensions}`)
  console.log(`Compressed size: ${sizeMB}MB`)
}

main().catch(console.error)
