/**
 * Embed Command
 *
 * Embed all messages using OpenAI embeddings API.
 * Caches results for use by filter command with embeddings method.
 */

import { countTokens } from '../../classifier/tokenizer'
import { embedMessages } from '../../index'
import type { ParsedMessage } from '../../types'
import type { CLIArgs } from '../args'
import { initCommand } from '../helpers'
import type { Logger } from '../logger'

const EMBEDDING_COST_PER_MILLION_TOKENS = 0.13
const MIN_MESSAGE_LENGTH = 10

interface EmbedStats {
  totalMessages: number
  embeddedMessages: number
  skippedMessages: number
  totalTokens: number
  totalBatches: number
  cachedBatches: number
  estimatedCost: number
}

function createEmbeddingCallbacks(logger: Logger, stats: EmbedStats) {
  return {
    onBatchComplete: (info: {
      phase: string
      batchIndex: number
      totalBatches: number
      itemsInBatch: number
      cacheHit: boolean
      durationMs: number
    }) => {
      if (info.phase === 'messages') {
        stats.totalBatches = info.totalBatches
        if (info.cacheHit) {
          stats.cachedBatches++
        }

        const batchNum = info.batchIndex + 1
        // Log every 10th batch or the last batch
        if (batchNum % 10 === 0 || batchNum === info.totalBatches) {
          const percent = Math.floor((batchNum / info.totalBatches) * 100)
          const cacheInfo = info.cacheHit ? ' (cached)' : ''
          logger.log(
            `   ${percent}% embedded (${batchNum}/${info.totalBatches} batches)${cacheInfo}`
          )
        }
      }
    }
  }
}

function countMessagesToEmbed(messages: readonly ParsedMessage[]): {
  toEmbed: readonly ParsedMessage[]
  skipped: number
  totalTokens: number
} {
  const toEmbed: ParsedMessage[] = []
  let totalTokens = 0

  for (const msg of messages) {
    if (msg.content.length > MIN_MESSAGE_LENGTH) {
      toEmbed.push(msg)
      totalTokens += countTokens(msg.content)
    }
  }

  return {
    toEmbed,
    skipped: messages.length - toEmbed.length,
    totalTokens
  }
}

export async function cmdEmbed(args: CLIArgs, logger: Logger): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey && !args.dryRun) {
    throw new Error('OPENAI_API_KEY required for embeddings')
  }

  const { ctx, parseResult } = await initCommand('Embed', args, logger)
  const { messages } = parseResult

  // Count messages to embed
  const { toEmbed, skipped, totalTokens } = countMessagesToEmbed(messages)
  const estimatedCost = (totalTokens / 1_000_000) * EMBEDDING_COST_PER_MILLION_TOKENS
  const batchCount = Math.ceil(toEmbed.length / 100)

  logger.log(`\n📊 Embedding Stats`)
  logger.log(`   Total messages: ${messages.length.toLocaleString()}`)
  logger.log(`   Messages to embed: ${toEmbed.length.toLocaleString()}`)
  logger.log(`   Skipped (too short): ${skipped.toLocaleString()}`)
  logger.log(`   Total tokens: ${totalTokens.toLocaleString()}`)
  logger.log(`   API batches: ${batchCount}`)
  logger.log(`   Estimated cost: $${estimatedCost.toFixed(4)}`)

  if (args.dryRun) {
    logger.log('\n🏃 Dry run - no API calls made')
    return
  }

  const stats: EmbedStats = {
    totalMessages: messages.length,
    embeddedMessages: toEmbed.length,
    skippedMessages: skipped,
    totalTokens,
    totalBatches: batchCount,
    cachedBatches: 0,
    estimatedCost
  }

  logger.log('\n🔮 Embedding messages...')

  const result = await embedMessages(
    toEmbed.map((m) => ({ id: m.id, content: m.content })),
    { apiKey: apiKey ?? '', ...createEmbeddingCallbacks(logger, stats) },
    ctx.apiCache
  )

  if (!result.ok) {
    throw new Error(`Embedding failed: ${result.error.message}`)
  }

  const embedded = result.value

  // Cache results
  ctx.pipelineCache.setStage('embeddings', embedded)
  ctx.pipelineCache.setStage('embed_stats', {
    totalMessages: stats.totalMessages,
    embeddedMessages: stats.embeddedMessages,
    skippedMessages: stats.skippedMessages,
    totalTokens: stats.totalTokens,
    totalBatches: stats.totalBatches,
    cachedBatches: stats.cachedBatches,
    estimatedCost: stats.estimatedCost
  })

  const cachedInfo =
    stats.cachedBatches > 0
      ? ` (${stats.cachedBatches}/${stats.totalBatches} batches from cache)`
      : ''

  logger.log(`\n✅ Embedded ${embedded.length.toLocaleString()} messages${cachedInfo}`)
  const runDir = ctx.pipelineCache.getRunDir()
  if (runDir) {
    logger.log(`   Results cached to: ${runDir}`)
  }
}
