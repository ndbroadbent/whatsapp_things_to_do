/**
 * Worker Pool
 *
 * Generic worker pool for parallel processing in CLI.
 * N workers continuously pull tasks from a queue.
 *
 * Usage:
 * ```typescript
 * const results = await runWorkerPool(
 *   batches,
 *   async (batch, index) => await processBatch(batch),
 *   {
 *     concurrency: 5,
 *     onProgress: ({ completed, total }) => console.log(`${completed}/${total}`)
 *   }
 * )
 * ```
 */

const DEFAULT_CONCURRENCY = 5

/**
 * Task processor function type.
 * @param task The task to process
 * @param index Original index of the task in the array
 * @returns Processed result
 */
type TaskProcessor<T, R> = (task: T, index: number) => Promise<R>

/**
 * Progress callback info.
 */
interface WorkerProgressInfo<R> {
  /** Task index (0-based) */
  readonly index: number
  /** Total number of tasks */
  readonly total: number
  /** Number of completed tasks so far */
  readonly completed: number
  /** Result of this task */
  readonly result: R
  /** Duration of this task in ms */
  readonly durationMs: number
}

/**
 * Error callback info.
 */
interface WorkerErrorInfo<T> {
  /** Task that failed */
  readonly task: T
  /** Task index (0-based) */
  readonly index: number
  /** Error that occurred */
  readonly error: Error
  /** Total number of tasks */
  readonly total: number
  /** Number of completed tasks so far */
  readonly completed: number
}

/**
 * Worker pool options.
 */
interface WorkerPoolOptions<T, R> {
  /** Number of concurrent workers (default 5) */
  readonly concurrency?: number
  /** Called after each task completes successfully */
  readonly onProgress?: (info: WorkerProgressInfo<R>) => void
  /** Called on task error. Return true to continue, false to stop all workers. */
  readonly onError?: (info: WorkerErrorInfo<T>) => boolean
}

/**
 * Result of running the worker pool.
 */
interface WorkerPoolResult<R> {
  /** Results in original task order (undefined for failed tasks) */
  readonly results: Array<R | undefined>
  /** Successfully completed results only, in original order */
  readonly successes: R[]
  /** Errors that occurred */
  readonly errors: ReadonlyArray<{ readonly index: number; readonly error: Error }>
  /** Total tasks processed */
  readonly total: number
  /** Number of successful tasks */
  readonly successCount: number
  /** Number of failed tasks */
  readonly errorCount: number
}

/**
 * Run tasks through a worker pool.
 *
 * Workers continuously pull from the queue until empty.
 * Results are returned in original task order.
 *
 * @param tasks Array of tasks to process
 * @param processor Function to process each task
 * @param options Worker pool options
 * @returns Results in original order
 */
export async function runWorkerPool<T, R>(
  tasks: readonly T[],
  processor: TaskProcessor<T, R>,
  options: WorkerPoolOptions<T, R> = {}
): Promise<WorkerPoolResult<R>> {
  if (tasks.length === 0) {
    return { results: [], successes: [], errors: [], total: 0, successCount: 0, errorCount: 0 }
  }

  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const results: Array<{ index: number; result: R } | undefined> = new Array(tasks.length)
  const errors: Array<{ index: number; error: Error }> = []

  // Shared state for workers
  let nextIndex = 0
  let completed = 0
  let shouldStop = false

  // Worker function - continuously pulls tasks until queue empty or stopped
  async function worker(): Promise<void> {
    while (!shouldStop) {
      // Atomically claim next task
      const index = nextIndex++
      if (index >= tasks.length) break

      const task = tasks[index]
      if (task === undefined) break

      const startTime = Date.now()

      try {
        const result = await processor(task, index)
        const durationMs = Date.now() - startTime

        results[index] = { index, result }
        completed++

        options.onProgress?.({
          index,
          total: tasks.length,
          completed,
          result,
          durationMs
        })
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e))
        errors.push({ index, error })
        completed++

        // Ask if we should continue
        const shouldContinue =
          options.onError?.({
            task,
            index,
            error,
            total: tasks.length,
            completed
          }) ?? true // Default: continue on error

        if (!shouldContinue) {
          shouldStop = true
        }
      }
    }
  }

  // Start workers (at most as many as tasks)
  const workerCount = Math.min(concurrency, tasks.length)
  const workers = Array.from({ length: workerCount }, () => worker())
  await Promise.all(workers)

  // Extract successful results in order
  const successes: R[] = []
  const orderedResults: Array<R | undefined> = []

  for (let i = 0; i < tasks.length; i++) {
    const entry = results[i]
    if (entry) {
      orderedResults.push(entry.result)
      successes.push(entry.result)
    } else {
      orderedResults.push(undefined)
    }
  }

  return {
    results: orderedResults,
    successes,
    errors,
    total: tasks.length,
    successCount: successes.length,
    errorCount: errors.length
  }
}
