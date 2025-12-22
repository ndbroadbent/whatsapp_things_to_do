/**
 * Candidates Command
 *
 * Extract candidate messages using heuristics and/or embeddings.
 */

import { writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { FilesystemCache } from '../../cache/filesystem.js'
import { countTokens } from '../../classifier/tokenizer.js'
import {
  extractCandidates,
  extractCandidatesByEmbeddings,
  extractCandidatesByHeuristics,
  VERSION
} from '../../index.js'
import type { CandidateMessage, ParsedMessage } from '../../types.js'
import type { CLIArgs, ExtractionMethod } from '../args.js'
import { formatDate, runParseWithLogs, truncate } from '../helpers.js'
import type { Logger } from '../logger.js'

interface CandidatesOutput {
  method: ExtractionMethod
  stats: {
    totalCandidates: number
    heuristicsMatches?: number
    regexMatches?: number
    urlMatches?: number
    embeddingsMatches?: number
  }
  candidates: readonly CandidateMessage[]
}

const EMBEDDING_COST_PER_MILLION_TOKENS = 0.13

function createEmbeddingCallbacks(logger: Logger) {
  return {
    onBatchComplete: (info: {
      phase: string
      batchIndex: number
      totalBatches: number
      itemsInBatch: number
      cacheHit: boolean
      durationMs: number
    }) => {
      // Only log non-cached requests to reduce noise
      if (info.phase === 'messages' && !info.cacheHit) {
        logger.log(
          `   [${info.batchIndex + 1}/${info.totalBatches}] Embedded ${info.itemsInBatch} messages (${info.durationMs}ms)`
        )
      }
    }
  }
}

function estimateEmbeddingCost(messages: readonly ParsedMessage[], logger: Logger): void {
  const messagesToEmbed = messages.filter((m) => m.content.length > 10)
  let totalTokens = 0

  for (const msg of messagesToEmbed) {
    totalTokens += countTokens(msg.content)
  }

  const costDollars = (totalTokens / 1_000_000) * EMBEDDING_COST_PER_MILLION_TOKENS
  const batchCount = Math.ceil(messagesToEmbed.length / 100)

  logger.log('\n📊 Embedding Cost Estimate (text-embedding-3-large)')
  logger.log(`   Messages to embed: ${messagesToEmbed.length.toLocaleString()}`)
  logger.log(`   Total tokens: ${totalTokens.toLocaleString()}`)
  logger.log(`   API batches: ${batchCount}`)
  logger.log(`   Estimated cost: $${costDollars.toFixed(4)}`)
}

function formatCandidatesText(output: CandidatesOutput, logger: Logger): void {
  const { method, stats, candidates } = output

  logger.log(`\n📊 Extraction Results (method: ${method})`)
  logger.log(`   Total candidates: ${stats.totalCandidates}`)

  if (stats.heuristicsMatches !== undefined) {
    logger.log(`   Heuristics: ${stats.heuristicsMatches}`)
    if (stats.regexMatches !== undefined) {
      logger.log(`     - Regex patterns: ${stats.regexMatches}`)
    }
    if (stats.urlMatches !== undefined) {
      logger.log(`     - URL-based: ${stats.urlMatches}`)
    }
  }
  if (stats.embeddingsMatches !== undefined) {
    logger.log(`   Embeddings: ${stats.embeddingsMatches}`)
  }

  logger.log('\n📋 Candidates (sorted by confidence):')
  logger.log('')

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]
    if (!c) continue

    const msg = truncate(c.content, 70)
    const sourceLabel =
      c.source.type === 'semantic'
        ? `matched: "${c.source.query}" (${c.source.similarity.toFixed(2)})`
        : c.source.type === 'url'
          ? `url (${c.source.urlType})`
          : `regex (${c.source.pattern})`

    logger.log(`${i + 1}. "${msg}"`)
    logger.log(`   ${c.sender} • ${formatDate(c.timestamp)}`)
    logger.log(`   ${sourceLabel}`)
    logger.log('')
  }
}

export async function cmdCandidates(args: CLIArgs, logger: Logger): Promise<void> {
  if (!args.input) {
    throw new Error('No input file specified')
  }

  logger.log(`\nChatToMap Candidates v${VERSION}`)
  logger.log(`\n📁 ${basename(args.input)}`)

  // Parse messages
  const { messages } = await runParseWithLogs(args.input, logger, {
    maxMessages: args.maxMessages
  })

  // Dry run: show cost estimate and exit
  if (args.dryRun && (args.method === 'embeddings' || args.method === 'both')) {
    estimateEmbeddingCost(messages, logger)
    return
  }

  const cacheDir = join(homedir(), '.cache', 'chat-to-map')
  const cache = new FilesystemCache(cacheDir)

  let output: CandidatesOutput

  if (args.method === 'heuristics') {
    logger.log('\n🔍 Extracting candidates (heuristics only)...')
    const result = extractCandidatesByHeuristics(messages, {
      minConfidence: args.minConfidence
    })
    output = {
      method: 'heuristics',
      stats: {
        totalCandidates: result.totalUnique,
        heuristicsMatches: result.totalUnique,
        regexMatches: result.regexMatches,
        urlMatches: result.urlMatches
      },
      candidates: result.candidates
    }
  } else if (args.method === 'embeddings') {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY required for embeddings extraction')
    }

    logger.log('\n🔍 Extracting candidates (embeddings only)...')
    const result = await extractCandidatesByEmbeddings(
      messages,
      { apiKey, ...createEmbeddingCallbacks(logger) },
      undefined,
      cache
    )

    if (!result.ok) {
      throw new Error(`Embeddings extraction failed: ${result.error.message}`)
    }

    output = {
      method: 'embeddings',
      stats: {
        totalCandidates: result.value.length,
        embeddingsMatches: result.value.length
      },
      candidates: result.value
    }
  } else {
    const apiKey = process.env.OPENAI_API_KEY

    logger.log('\n🔍 Extracting candidates (heuristics + embeddings)...')

    const result = await extractCandidates(
      messages,
      apiKey
        ? {
            heuristics: { minConfidence: args.minConfidence },
            embeddings: { config: { apiKey, ...createEmbeddingCallbacks(logger) } },
            cache
          }
        : {
            heuristics: { minConfidence: args.minConfidence },
            cache
          }
    )

    if (!result.ok) {
      throw new Error(`Extraction failed: ${result.error.message}`)
    }

    output = {
      method: 'both',
      stats: {
        totalCandidates: result.value.totalUnique,
        heuristicsMatches: result.value.regexMatches + result.value.urlMatches,
        regexMatches: result.value.regexMatches,
        urlMatches: result.value.urlMatches,
        embeddingsMatches: result.value.embeddingsMatches
      },
      candidates: result.value.candidates
    }

    if (!apiKey) {
      logger.log('   (embeddings skipped - OPENAI_API_KEY not set)')
    }
  }

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved ${output.stats.totalCandidates} candidates to ${args.jsonOutput}`)
    }
  } else {
    formatCandidatesText(output, logger)
  }
}
