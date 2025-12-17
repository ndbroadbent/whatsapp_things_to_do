/**
 * CLI File I/O
 *
 * File reading and writing utilities for the CLI.
 */

import { mkdir, readFile } from 'node:fs/promises'

/**
 * Read an input file, handling zip archives.
 */
export async function readInputFile(path: string): Promise<string> {
  // Check if it's a zip file
  if (path.endsWith('.zip')) {
    const JSZip = await import('jszip')
    const zipBuffer = await readFile(path)
    const zip = await JSZip.default.loadAsync(new Uint8Array(zipBuffer))

    // Find the chat file in the zip
    const chatFile = Object.keys(zip.files).find(
      (name) => name.endsWith('.txt') || name === '_chat.txt'
    )

    if (!chatFile) {
      throw new Error('No chat file found in zip archive')
    }

    const file = zip.files[chatFile]
    if (!file) {
      throw new Error('Could not read chat file from zip')
    }

    const content = await file.async('string')
    return content
  }

  // Plain text file
  return readFile(path, 'utf-8')
}

/**
 * Ensure a directory exists.
 */
export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true })
}
