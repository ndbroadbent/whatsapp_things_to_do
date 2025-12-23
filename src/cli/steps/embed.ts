/**
 * Embed Step
 *
 * Embed all messages using OpenAI embeddings API.
 * Results are cached in the API cache for later use by filter.
 */

import { messageEmbeddings } from '../../extraction/embeddings/index'
import type { ParsedMessage } from '../../types'
import { createEmbeddingProgressLogger } from '../helpers'
import type { PipelineContext } from './context'

const MIN_MESSAGE_LENGTH = 10

interface EmbedResult {
  readonly totalEmbedded: number
  readonly fromCache: boolean
}

interface EmbedOptions {
  readonly quiet?: boolean
}

/**
 * Run the embed step.
 *
 * Checks pipeline cache first, embeds fresh if needed.
 * Actual embeddings go to API cache - pipeline cache just stores stats.
 */
export async function stepEmbed(
  ctx: PipelineContext,
  messages: readonly ParsedMessage[],
  options?: EmbedOptions
): Promise<EmbedResult> {
  const { pipelineCache, apiCache, logger } = ctx

  // Check cache
  if (pipelineCache.hasStage('embed_stats')) {
    const stats = pipelineCache.getStage<{ totalEmbedded: number }>('embed_stats')
    if (!options?.quiet) {
      logger.log('\n🔮 Embedding messages... 📦 cached')
    }
    return { totalEmbedded: stats?.totalEmbedded ?? 0, fromCache: true }
  }

  if (!options?.quiet) {
    logger.log('\n🔮 Embedding messages...')
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY required for embeddings')
  }

  // Filter messages to embed
  const toEmbed = messages
    .filter((m) => m.content.length > MIN_MESSAGE_LENGTH)
    .map((m) => ({ id: m.id, content: m.content }))

  const progressLogger = createEmbeddingProgressLogger(logger, 'embedded')
  const result = await messageEmbeddings(toEmbed, { apiKey }, apiCache, {
    onBatch: (_, info) => progressLogger(info)
  })

  if (!result.ok) {
    throw new Error(`Embedding failed: ${result.error.message}`)
  }

  const { totalEmbedded } = result.value

  // Save stats to pipeline cache
  pipelineCache.setStage('embed_stats', { totalEmbedded })

  return { totalEmbedded, fromCache: false }
}
