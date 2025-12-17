/**
 * CLI Logger
 *
 * Progress reporting and logging utilities for the CLI.
 */

export interface Logger {
  log: (msg: string) => void
  verbose: (msg: string) => void
  success: (msg: string) => void
  error: (msg: string) => void
  progress: (msg: string, current: number, total: number) => void
}

export function createLogger(quiet: boolean, verbose: boolean): Logger {
  return {
    log: (msg: string) => {
      if (!quiet) console.log(msg)
    },
    verbose: (msg: string) => {
      if (verbose) console.log(`  [debug] ${msg}`)
    },
    success: (msg: string) => {
      if (!quiet) console.log(`  ✓ ${msg}`)
    },
    error: (msg: string) => {
      console.error(`  ✗ ${msg}`)
    },
    progress: (msg: string, current: number, total: number) => {
      if (!quiet) {
        const pct = Math.round((current / total) * 100)
        const bar = '█'.repeat(Math.round(pct / 2.5)) + '░'.repeat(40 - Math.round(pct / 2.5))
        process.stdout.write(`\r  [${bar}] ${pct}% ${msg}`)
        if (current === total) {
          process.stdout.write('\n')
        }
      }
    }
  }
}
