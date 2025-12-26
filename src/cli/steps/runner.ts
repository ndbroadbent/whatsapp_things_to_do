/**
 * Step Runner
 *
 * Manages pipeline step execution with automatic dependency resolution.
 * Each step declares its dependencies and the runner ensures they run first.
 */

import type { ImageResult } from '../../images/types'
import type { ScrapedMetadata } from '../../scraper/types'
import type {
  CandidateMessage,
  ClassifiedActivity,
  GeocodedActivity,
  ParsedMessage
} from '../../types'
import type { CLIArgs } from '../args'
import type { Logger } from '../logger'
import type { PipelineContext } from './context'
import type { ExportFormat } from './export'

/**
 * All pipeline step outputs, keyed by step name.
 */
interface StepOutputs {
  parse: { messages: readonly ParsedMessage[] }
  scan: { candidates: readonly CandidateMessage[] }
  embed: { embedded: boolean }
  filter: { candidates: readonly CandidateMessage[] }
  scrapeUrls: { metadataMap: Map<string, ScrapedMetadata> }
  classify: { activities: readonly ClassifiedActivity[] }
  geocode: { activities: readonly GeocodedActivity[] }
  fetchImageUrls: { images: Map<string, ImageResult | null> }
  fetchImages: { thumbnails: Map<string, Buffer> }
  export: { exportedFiles: Map<ExportFormat, string> }
}

type StepName = keyof StepOutputs

/**
 * Step runner that manages dependencies and caching.
 */
export class StepRunner {
  private readonly ctx: PipelineContext
  private readonly args: CLIArgs
  private readonly outputs = new Map<StepName, StepOutputs[StepName]>()
  private readonly pending = new Map<StepName, Promise<StepOutputs[StepName]>>()

  constructor(ctx: PipelineContext, args: CLIArgs, _logger: Logger) {
    this.ctx = ctx
    this.args = args
  }

  /**
   * Run a step and all its dependencies.
   * Uses pending promise map to prevent duplicate execution when called concurrently.
   */
  async run<K extends StepName>(step: K): Promise<StepOutputs[K]> {
    // Return cached output if already completed
    const cached = this.outputs.get(step)
    if (cached) {
      return cached as StepOutputs[K]
    }

    // Return pending promise if step is already running
    const pendingPromise = this.pending.get(step)
    if (pendingPromise) {
      return pendingPromise as Promise<StepOutputs[K]>
    }

    // Execute step and track the pending promise
    const promise = this.executeStep(step).then((output) => {
      this.outputs.set(step, output)
      this.pending.delete(step)
      return output
    })
    this.pending.set(step, promise as Promise<StepOutputs[StepName]>)
    return promise
  }

  private async executeStep<K extends StepName>(step: K): Promise<StepOutputs[K]> {
    switch (step) {
      case 'parse':
        return this.runParse() as Promise<StepOutputs[K]>
      case 'scan':
        return this.runScan() as Promise<StepOutputs[K]>
      case 'embed':
        return this.runEmbed() as Promise<StepOutputs[K]>
      case 'filter':
        return this.runFilter() as Promise<StepOutputs[K]>
      case 'scrapeUrls':
        return this.runScrapeUrls() as Promise<StepOutputs[K]>
      case 'classify':
        return this.runClassify() as Promise<StepOutputs[K]>
      case 'geocode':
        return this.runGeocode() as Promise<StepOutputs[K]>
      case 'fetchImageUrls':
        return this.runFetchImageUrls() as Promise<StepOutputs[K]>
      case 'fetchImages':
        return this.runFetchImages() as Promise<StepOutputs[K]>
      case 'export':
        return this.runExport() as Promise<StepOutputs[K]>
      default:
        throw new Error(`Unknown step: ${step}`)
    }
  }

  // ============================================================================
  // Step implementations with dependencies
  // ============================================================================

  private async runParse(): Promise<StepOutputs['parse']> {
    const { stepParse } = await import('./parse')
    const result = stepParse(this.ctx, { maxMessages: this.args.maxMessages })
    return { messages: result.messages }
  }

  private async runScan(): Promise<StepOutputs['scan']> {
    // Dependency: parse
    await this.run('parse')

    const { stepScan } = await import('./scan')
    const result = stepScan(this.ctx, {
      minConfidence: this.args.minConfidence,
      maxMessages: this.args.maxMessages,
      quiet: true
    })
    return { candidates: result.candidates }
  }

  private async runEmbed(): Promise<StepOutputs['embed']> {
    // Dependency: parse
    const { messages } = await this.run('parse')

    const { stepEmbed } = await import('./embed')
    await stepEmbed(this.ctx, messages)
    return { embedded: true }
  }

  private async runFilter(): Promise<StepOutputs['filter']> {
    // Dependencies: scan, embed
    await Promise.all([this.run('scan'), this.run('embed')])

    const { stepFilter } = await import('./filter')
    const result = await stepFilter(this.ctx)
    return { candidates: result.candidates }
  }

  private async runScrapeUrls(): Promise<StepOutputs['scrapeUrls']> {
    // Dependency: filter
    const { candidates } = await this.run('filter')

    const { stepScrapeUrls } = await import('./scrape-urls')
    const result = await stepScrapeUrls(this.ctx, candidates, {
      timeout: this.args.scrapeTimeout
    })
    return { metadataMap: result.metadataMap }
  }

  private async runClassify(): Promise<StepOutputs['classify']> {
    // Dependencies: filter, scrapeUrls
    const [{ candidates }, { metadataMap }] = await Promise.all([
      this.run('filter'),
      this.run('scrapeUrls')
    ])

    const { stepClassify } = await import('./classify')
    const result = await stepClassify(this.ctx, candidates, {
      homeCountry: this.args.homeCountry,
      timezone: this.args.timezone,
      configFile: this.args.configFile,
      urlMetadata: metadataMap,
      batchSize: 30
    })
    return { activities: result.activities }
  }

  private async runGeocode(): Promise<StepOutputs['geocode']> {
    // Dependency: classify
    const { activities } = await this.run('classify')

    const { stepGeocode } = await import('./geocode')
    const result = await stepGeocode(this.ctx, activities, {
      homeCountry: this.args.homeCountry
    })
    return { activities: result.activities }
  }

  private async runFetchImageUrls(): Promise<StepOutputs['fetchImageUrls']> {
    // Dependency: geocode
    const { activities } = await this.run('geocode')

    const { stepFetchImageUrls } = await import('./fetch-image-urls')
    const result = await stepFetchImageUrls(this.ctx, activities, {
      skipCdn: this.args.skipCdn,
      skipPixabay: this.args.skipPixabay,
      skipWikipedia: this.args.skipWikipedia,
      skipGooglePlaces: this.args.skipGooglePlaces
    })
    return { images: result.images }
  }

  private async runFetchImages(): Promise<StepOutputs['fetchImages']> {
    // Dependency: fetchImageUrls
    const { images } = await this.run('fetchImageUrls')

    const { stepFetchImages } = await import('./fetch-images')
    const result = await stepFetchImages(this.ctx, images)
    return { thumbnails: result.thumbnails }
  }

  private async runExport(): Promise<StepOutputs['export']> {
    // Dependencies: geocode, and optionally fetchImages (if --images flag)
    const { activities } = await this.run('geocode')

    // Only fetch images if explicitly requested via --images flag
    let thumbnails: Map<string, Buffer> = new Map()
    if (this.args.fetchImages) {
      const result = await this.run('fetchImages')
      thumbnails = result.thumbnails
    }

    const { stepExport } = await import('./export')
    const result = await stepExport(this.ctx, activities, {
      outputDir: this.args.outputDir,
      formats: this.args.formats as ExportFormat[],
      thumbnails
    })
    return { exportedFiles: result.exportedFiles }
  }
}
