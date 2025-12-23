/**
 * Filter Command
 *
 * Extract candidate messages using heuristics and/or embeddings.
 * Caches results to pipeline cache for subsequent steps.
 */

import { writeFile } from 'node:fs/promises'
import { countTokens } from '../../classifier/tokenizer'
import { extractCandidatesByEmbeddings, extractCandidatesByHeuristics } from '../../index'
import type { CandidateMessage, ParsedMessage } from '../../types'
import type { CLIArgs, ExtractionMethod } from '../args'
import { formatDate, initCommand, truncate } from '../helpers'
import type { Logger } from '../logger'
import type { PipelineContext } from '../steps/context'
import { stepEmbed } from '../steps/embed'

interface FilterOutput {
  method: ExtractionMethod
  stats: FilterStats
  candidates: readonly CandidateMessage[]
}

interface FilterStats {
  totalCandidates: number
  heuristicsMatches?: number | undefined
  regexMatches?: number | undefined
  urlMatches?: number | undefined
  embeddingsMatches?: number | undefined
}

const EMBEDDING_COST_PER_MILLION_TOKENS = 0.13

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

function formatCandidatesText(output: FilterOutput, logger: Logger, showAll: boolean): void {
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

  const displayCount = showAll ? candidates.length : Math.min(10, candidates.length)
  const header = showAll
    ? `\n📋 All ${candidates.length} Candidates:`
    : `\n📋 Top ${displayCount} Candidates:`
  logger.log(header)
  logger.log('')

  for (let i = 0; i < displayCount; i++) {
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

  if (!showAll && candidates.length > 10) {
    logger.log(`   ... and ${candidates.length - 10} more (use --all to show all)`)
  }
}

/**
 * Run heuristics extraction, using cache if available.
 */
function runHeuristics(
  ctx: PipelineContext,
  messages: readonly ParsedMessage[],
  minConfidence?: number
): { candidates: readonly CandidateMessage[]; stats: FilterStats; fromCache: boolean } {
  const { pipelineCache, logger } = ctx

  // Check cache
  if (pipelineCache.hasStage('candidates.heuristics')) {
    const cached = pipelineCache.getStage<CandidateMessage[]>('candidates.heuristics') ?? []
    logger.log('\n🔍 Extracting candidates (heuristics)... 📦 cached')
    return {
      candidates: cached,
      stats: {
        totalCandidates: cached.length,
        heuristicsMatches: cached.length
      },
      fromCache: true
    }
  }

  logger.log('\n🔍 Extracting candidates (heuristics)...')
  const extractorOptions = minConfidence !== undefined ? { minConfidence } : undefined
  const result = extractCandidatesByHeuristics(messages, extractorOptions)

  // Cache results
  pipelineCache.setStage('candidates.heuristics', [...result.candidates])
  pipelineCache.setStage('scan_stats', {
    totalUnique: result.totalUnique,
    regexMatches: result.regexMatches,
    urlMatches: result.urlMatches
  })

  return {
    candidates: result.candidates,
    stats: {
      totalCandidates: result.totalUnique,
      heuristicsMatches: result.totalUnique,
      regexMatches: result.regexMatches,
      urlMatches: result.urlMatches
    },
    fromCache: false
  }
}

/**
 * Run embeddings extraction, using cache if available.
 */
async function runEmbeddings(
  ctx: PipelineContext,
  messages: readonly ParsedMessage[],
  logger: Logger
): Promise<{ candidates: readonly CandidateMessage[]; fromCache: boolean }> {
  const { pipelineCache, apiCache } = ctx

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for embeddings extraction')
  }

  // Run embed step (will use cache if available)
  await stepEmbed(ctx, messages)

  // Check cache for candidates
  if (pipelineCache.hasStage('candidates.embeddings')) {
    const cached = pipelineCache.getStage<CandidateMessage[]>('candidates.embeddings') ?? []
    logger.log('\n🔍 Extracting candidates (embeddings)... 📦 cached')
    return { candidates: cached, fromCache: true }
  }

  // Extract candidates
  logger.log('\n🔍 Extracting candidates (embeddings)...')
  const result = await extractCandidatesByEmbeddings(messages, { apiKey }, undefined, apiCache)

  if (!result.ok) {
    throw new Error(`Embeddings extraction failed: ${result.error.message}`)
  }

  // Cache results
  pipelineCache.setStage('candidates.embeddings', [...result.value])

  return { candidates: result.value, fromCache: false }
}

/**
 * Merge heuristics and embeddings candidates, deduplicating by messageId.
 */
function mergeCandidates(
  heuristics: readonly CandidateMessage[],
  embeddings: readonly CandidateMessage[]
): CandidateMessage[] {
  const seen = new Set<number>()
  const merged: CandidateMessage[] = []

  // Heuristics first (higher priority)
  for (const c of heuristics) {
    if (!seen.has(c.messageId)) {
      seen.add(c.messageId)
      merged.push(c)
    }
  }

  // Then embeddings
  for (const c of embeddings) {
    if (!seen.has(c.messageId)) {
      seen.add(c.messageId)
      merged.push(c)
    }
  }

  return merged
}

export async function cmdFilter(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, parseResult } = await initCommand('Filter', args, logger)

  // Dry run: show cost estimate and exit
  if (args.dryRun && (args.method === 'embeddings' || args.method === 'both')) {
    estimateEmbeddingCost(parseResult.messages, logger)
    return
  }

  let output: FilterOutput

  if (args.method === 'heuristics') {
    const result = runHeuristics(ctx, parseResult.messages, args.minConfidence)
    output = {
      method: 'heuristics',
      stats: result.stats,
      candidates: result.candidates
    }
  } else if (args.method === 'embeddings') {
    const result = await runEmbeddings(ctx, parseResult.messages, logger)
    output = {
      method: 'embeddings',
      stats: {
        totalCandidates: result.candidates.length,
        embeddingsMatches: result.candidates.length
      },
      candidates: result.candidates
    }

    // Save filter stats
    ctx.pipelineCache.setStage('filter_stats', {
      totalCandidates: result.candidates.length,
      embeddingsMatches: result.candidates.length
    })
  } else {
    // Both: heuristics + embeddings
    const heuristicsResult = runHeuristics(ctx, parseResult.messages, args.minConfidence)

    let embeddingsResult: { candidates: readonly CandidateMessage[]; fromCache: boolean }
    const apiKey = process.env.OPENAI_API_KEY

    if (apiKey) {
      embeddingsResult = await runEmbeddings(ctx, parseResult.messages, logger)
    } else {
      logger.log('   (embeddings skipped - OPENAI_API_KEY not set)')
      embeddingsResult = { candidates: [], fromCache: false }
    }

    // Merge and deduplicate
    const merged = mergeCandidates(heuristicsResult.candidates, embeddingsResult.candidates)

    // Cache merged results
    ctx.pipelineCache.setStage('candidates.all', merged)
    ctx.pipelineCache.setStage('filter_stats', {
      totalCandidates: merged.length,
      heuristicsMatches: heuristicsResult.candidates.length,
      embeddingsMatches: embeddingsResult.candidates.length
    })

    output = {
      method: 'both',
      stats: {
        totalCandidates: merged.length,
        heuristicsMatches: heuristicsResult.stats.heuristicsMatches,
        regexMatches: heuristicsResult.stats.regexMatches,
        urlMatches: heuristicsResult.stats.urlMatches,
        embeddingsMatches: embeddingsResult.candidates.length
      },
      candidates: merged
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
    formatCandidatesText(output, logger, args.showAll)
  }
}
