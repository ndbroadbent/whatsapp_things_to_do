/**
 * Resolve Links Command
 *
 * Resolves entity hints (movies, books, games) to canonical URLs.
 * Runs: parse → scan → embed → filter → scrape → classify → place-lookup → resolve-links
 */

import { writeFile } from 'node:fs/promises'
import type { GeocodedActivity } from '../../types'
import type { CLIArgs } from '../args'
import { formatActivityHeader, initCommandContext } from '../helpers'
import type { Logger } from '../logger'
import { stepResolveLinks } from '../steps/resolve-links'
import { StepRunner } from '../steps/runner'

interface ResolveLinkOutput {
  activitiesProcessed: number
  withLinkHints: number
  resolved: number
  failed: number
  activities: Array<{
    activityId: string
    activity: string
    category: string
    resolvedUrl: string | null
    linkPreview: {
      url: string
      title: string | null
      description: string | null
      domain: string
      source: 'resolved' | 'scraped'
      entityType?: string
    } | null
  }>
}

export async function cmdResolveLinks(args: CLIArgs, logger: Logger): Promise<void> {
  const { ctx, config } = await initCommandContext('Resolve Links', args, logger)

  // Use StepRunner to handle dependencies
  const runner = new StepRunner(ctx, args, config, logger)

  // Run place-lookup step (which runs the full chain before it)
  const { activities: geocodedActivities } = await runner.run('placeLookup')

  logger.log(`   Geocoded ${geocodedActivities.length} activities`)

  if (geocodedActivities.length === 0) {
    logger.log('\n⚠️  No activities found. Nothing to resolve.')
    return
  }

  // Dry run: show stats and exit
  if (args.dryRun) {
    const withLinks = geocodedActivities.filter((a) => a.link).length
    logger.log('\n📊 Resolve Links Estimate (dry run)')
    logger.log(`   Activities: ${geocodedActivities.length}`)
    logger.log(`   With link hints: ${withLinks}`)
    logger.log(`   Will resolve: ${withLinks} entities`)
    return
  }

  // Run resolve links step
  const resolveResult = await stepResolveLinks(ctx, geocodedActivities)

  // Summary
  logger.log('\n📊 Resolve Links Results')
  logger.log(`   Processed: ${resolveResult.stats.activitiesProcessed}`)
  logger.log(`   With link hints: ${resolveResult.stats.withLinkHints}`)
  logger.log(`   Resolved: ${resolveResult.stats.resolved}`)
  if (resolveResult.stats.failed > 0) {
    logger.log(`   Failed: ${resolveResult.stats.failed}`)
  }

  const output: ResolveLinkOutput = {
    activitiesProcessed: resolveResult.stats.activitiesProcessed,
    withLinkHints: resolveResult.stats.withLinkHints,
    resolved: resolveResult.stats.resolved,
    failed: resolveResult.stats.failed,
    activities: resolveResult.activities
      .filter((a) => a.resolvedUrl || a.link)
      .map((a) => ({
        activityId: a.activityId,
        activity: a.activity,
        category: a.category,
        resolvedUrl: a.resolvedUrl ?? null,
        linkPreview: null // Not populated until scrape-previews step
      }))
  }

  if (args.jsonOutput) {
    const json = JSON.stringify(output, null, 2)
    if (args.jsonOutput === 'stdout') {
      console.log(json)
    } else {
      await writeFile(args.jsonOutput, json)
      logger.success(`\n✓ Saved resolve links results to ${args.jsonOutput}`)
    }
  } else {
    displayActivities(resolveResult.activities, logger, args.showAll, args.maxResults)
  }
}

function displayActivities(
  activities: readonly GeocodedActivity[],
  logger: Logger,
  showAll: boolean,
  maxResults: number
): void {
  // Show only activities with resolved URLs
  const resolved = activities.filter((a) => a.resolvedUrl)

  if (resolved.length === 0) {
    logger.log('\n🔗 Resolved Links: none')
    return
  }

  logger.log('\n🔗 Resolved Links:')
  logger.log('')

  const displayCount = showAll ? resolved.length : Math.min(maxResults, resolved.length)

  for (let i = 0; i < displayCount; i++) {
    const a = resolved[i]
    if (!a) continue

    const { line1, line2 } = formatActivityHeader(i, a)
    logger.log(line1)
    logger.log(line2)

    // Show resolved URL
    if (a.resolvedUrl) {
      logger.log(`   🔗 ${a.resolvedUrl}`)
    }

    // Show link type if available
    if (a.link?.type) {
      logger.log(`   📎 Type: ${a.link.type}`)
    }

    logger.log('')
  }

  if (!showAll && resolved.length > maxResults) {
    logger.log(`   ... and ${resolved.length - maxResults} more (use --all to show all)`)
  }
}
