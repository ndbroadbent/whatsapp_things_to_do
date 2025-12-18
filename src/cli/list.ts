/**
 * CLI List Command
 *
 * Show a table of previously processed chats.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import type { Logger } from './logger.js'

/**
 * Metadata from a processed chat result.
 */
interface ProcessedChat {
  readonly name: string
  readonly processedAt: Date
  readonly suggestionCount: number
  readonly geocodedCount: number
  readonly path: string
}

/**
 * Try to read metadata from a processed chat directory.
 */
async function readChatMetadata(dirPath: string): Promise<ProcessedChat | null> {
  try {
    const jsonPath = join(dirPath, 'suggestions.json')
    const content = await readFile(jsonPath, 'utf-8')
    const data = JSON.parse(content) as {
      metadata?: { generatedAt?: string; suggestionCount?: number; geocodedCount?: number }
      suggestions?: unknown[]
    }

    const stats = await stat(jsonPath)
    const name = dirPath.split('/').pop() ?? 'unknown'

    // Get suggestion count from metadata or array length
    const suggestionCount = data.metadata?.suggestionCount ?? data.suggestions?.length ?? 0
    const geocodedCount = data.metadata?.geocodedCount ?? 0

    // Get processed date from metadata or file mtime
    let processedAt: Date
    if (data.metadata?.generatedAt) {
      processedAt = new Date(data.metadata.generatedAt)
    } else {
      processedAt = stats.mtime
    }

    return {
      name,
      processedAt,
      suggestionCount,
      geocodedCount,
      path: dirPath
    }
  } catch {
    // Directory doesn't have valid metadata
    return null
  }
}

/**
 * Format a date for display.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Pad a string to a given length.
 */
function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length)
}

/**
 * List all processed chats in the output directory.
 */
export async function listProcessedChats(
  outputDir: string,
  logger: Logger
): Promise<ProcessedChat[]> {
  const chats: ProcessedChat[] = []

  logger.verbose(`Scanning for processed chats in: ${outputDir}`)

  try {
    const entries = await readdir(outputDir, { withFileTypes: true })
    logger.verbose(`Found ${entries.length} entries in output directory`)

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = join(outputDir, entry.name)
        const metadata = await readChatMetadata(dirPath)
        if (metadata) {
          chats.push(metadata)
          logger.verbose(`Found chat: ${metadata.name} (${metadata.suggestionCount} suggestions)`)
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.verbose(`Output directory does not exist: ${outputDir}`)
      return []
    }
    throw error
  }

  // Sort by processed date, newest first
  return chats.sort((a, b) => b.processedAt.getTime() - a.processedAt.getTime())
}

/**
 * Display the list of processed chats as a table.
 */
export function displayProcessedChats(chats: readonly ProcessedChat[], logger: Logger): void {
  if (chats.length === 0) {
    logger.log('\nNo processed chats found.')
    logger.log(`\nRun 'chat-to-map analyze <chat.zip>' to process your first chat.`)
    return
  }

  // Column widths
  const nameWidth = 30
  const dateWidth = 20
  const suggestionsWidth = 12
  const geocodedWidth = 10

  // Header
  const header = [
    padEnd('Name', nameWidth),
    padEnd('Processed', dateWidth),
    padEnd('Suggestions', suggestionsWidth),
    padEnd('Geocoded', geocodedWidth)
  ].join(' ')

  const separator = '-'.repeat(header.length)

  logger.log('')
  logger.log(header)
  logger.log(separator)

  // Rows
  for (const chat of chats) {
    const row = [
      padEnd(chat.name, nameWidth),
      padEnd(formatDate(chat.processedAt), dateWidth),
      padEnd(chat.suggestionCount.toString(), suggestionsWidth),
      padEnd(chat.geocodedCount.toString(), geocodedWidth)
    ].join(' ')
    logger.log(row)
  }

  logger.log('')
  logger.log(`Total: ${chats.length} processed chat${chats.length === 1 ? '' : 's'}`)
}

/**
 * Run the list command.
 */
export async function cmdList(outputDir: string, logger: Logger): Promise<void> {
  logger.log('\nProcessed Chats:')

  const chats = await listProcessedChats(outputDir, logger)
  displayProcessedChats(chats, logger)
}
