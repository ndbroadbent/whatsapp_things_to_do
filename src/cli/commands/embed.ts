/**
 * Embed Command
 *
 * Embed all messages using OpenAI embeddings API.
 * Caches results for use by filter command with embeddings method.
 */

import { countTokens } from '../../classifier/tokenizer'
import {
  calculateEmbeddingCost,
  DEFAULT_EMBEDDING_MODELS,
  formatMicrosAsDollars
} from '../../costs'
import type { ParsedMessage } from '../../types'
import type { CLIArgs } from '../args'
import { initCommand } from '../helpers'
import type { Logger } from '../logger'
import { stepEmbed } from '../steps/embed'

const MIN_MESSAGE_LENGTH = 10

function analyzeMessages(messages: readonly ParsedMessage[]): {
  toEmbed: number
  skipped: number
  totalTokens: number
} {
  let toEmbed = 0
  let totalTokens = 0

  for (const msg of messages) {
    if (msg.content.length > MIN_MESSAGE_LENGTH) {
      toEmbed++
      totalTokens += countTokens(msg.content)
    }
  }

  return {
    toEmbed,
    skipped: messages.length - toEmbed,
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

  // Analyze messages to embed
  const { toEmbed, skipped, totalTokens } = analyzeMessages(messages)
  const embeddingModel = DEFAULT_EMBEDDING_MODELS.openai
  const estimatedCostMicros = calculateEmbeddingCost(embeddingModel, totalTokens)
  const batchCount = Math.ceil(toEmbed / 100)

  logger.log(`\n📊 Embedding Stats`)
  logger.log(`   Total messages: ${messages.length.toLocaleString()}`)
  logger.log(`   Messages to embed: ${toEmbed.toLocaleString()}`)
  logger.log(`   Skipped (too short): ${skipped.toLocaleString()}`)
  logger.log(`   Total tokens: ${totalTokens.toLocaleString()}`)
  logger.log(`   API batches: ${batchCount}`)
  logger.log(`   Model: ${embeddingModel}`)
  logger.log(`   Estimated cost: ${formatMicrosAsDollars(estimatedCostMicros)}`)

  if (args.dryRun) {
    logger.log('\n🏃 Dry run - no API calls made')
    return
  }

  const result = await stepEmbed(ctx, messages)

  if (!result.fromCache) {
    logger.log(`\n✅ Embedded ${result.totalEmbedded.toLocaleString()} messages`)
    logger.log(`   Results saved to API cache: ${ctx.cacheDir}`)
  }
}
