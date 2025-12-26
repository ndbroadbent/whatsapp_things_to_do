/**
 * CLI Configuration
 *
 * Manages persistent settings stored in ~/.config/chat-to-map/config.json (XDG standard).
 * Supports custom config file location via --config-file flag or CHAT_TO_MAP_CONFIG env var.
 */

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/**
 * All persistable CLI settings.
 */
export interface Config {
  /** User's home country (e.g., "New Zealand") */
  homeCountry?: string | undefined
  /** User's timezone (e.g., "Pacific/Auckland") */
  timezone?: string | undefined
  /** Custom cache directory */
  cacheDir?: string | undefined
  /** Whether to fetch images for activities */
  fetchImages?: boolean | undefined
  /** Output directory for exports */
  outputDir?: string | undefined
  /** Export formats (csv,excel,json,map,pdf) */
  formats?: string[] | undefined

  // === Common export settings (apply to ALL formats) ===
  /** Filter ALL exports by categories */
  exportCategories?: string[] | undefined
  /** Filter ALL exports by countries */
  exportCountries?: string[] | undefined
  /** Filter ALL exports by sender names */
  exportFrom?: string[] | undefined
  /** Filter ALL exports to on/after this date (YYYY-MM-DD) */
  exportStartDate?: string | undefined
  /** Filter ALL exports to on/before this date (YYYY-MM-DD) */
  exportEndDate?: string | undefined
  /** Min score threshold for ALL exports (0-3) */
  exportMinScore?: number | undefined
  /** Only export activities with specific locations */
  exportOnlyLocations?: boolean | undefined
  /** Only export generic activities without locations */
  exportOnlyGeneric?: boolean | undefined
  /** Max activities in ALL exports (0 = all) */
  exportMaxActivities?: number | undefined
  /** Sort order for ALL exports: score, oldest, newest */
  exportSort?: string | undefined

  // === PDF-specific settings (override export* for PDF only) ===
  /** Include thumbnails in PDF exports */
  pdfThumbnails?: boolean | undefined
  /** Show score in PDF output */
  pdfIncludeScore?: boolean | undefined
  /** Group by country in PDF (default: true) */
  pdfGroupByCountry?: boolean | undefined
  /** Group by category in PDF (default: true) */
  pdfGroupByCategory?: boolean | undefined
  /** PDF page size: A4 or Letter (default: based on home country) */
  pdfPageSize?: string | undefined
  /** Custom PDF title */
  pdfTitle?: string | undefined
  /** Custom PDF subtitle */
  pdfSubtitle?: string | undefined
  /** Filter PDF by categories (overrides exportCategories) */
  pdfCategories?: string[] | undefined
  /** Filter PDF by countries (overrides exportCountries) */
  pdfCountries?: string[] | undefined
  /** Filter PDF by sender names (overrides exportFrom) */
  pdfFrom?: string[] | undefined
  /** Filter PDF to on/after this date (overrides exportStartDate) */
  pdfStartDate?: string | undefined
  /** Filter PDF to on/before this date (overrides exportEndDate) */
  pdfEndDate?: string | undefined
  /** Min score for PDF (overrides exportMinScore) */
  pdfMinScore?: number | undefined
  /** Only locations in PDF (overrides exportOnlyLocations) */
  pdfOnlyLocations?: boolean | undefined
  /** Only generic in PDF (overrides exportOnlyGeneric) */
  pdfOnlyGeneric?: boolean | undefined
  /** Max activities in PDF (overrides exportMaxActivities) */
  pdfMaxActivities?: number | undefined
  /** Sort order for PDF (overrides exportSort) */
  pdfSort?: string | undefined

  // === Map-specific settings ===
  /** Default map tile style */
  mapDefaultStyle?: string | undefined

  /** When settings were last updated */
  updatedAt?: string | undefined
}

/** Valid config keys for type-safe access */
export type ConfigKey = keyof Omit<Config, 'updatedAt'>

/** Config keys that accept string values */
const STRING_KEYS: ConfigKey[] = [
  'homeCountry',
  'timezone',
  'cacheDir',
  'outputDir',
  // Common export
  'exportStartDate',
  'exportEndDate',
  'exportSort',
  // PDF-specific
  'pdfPageSize',
  'pdfTitle',
  'pdfSubtitle',
  'pdfStartDate',
  'pdfEndDate',
  'pdfSort',
  // Map-specific
  'mapDefaultStyle'
]
/** Config keys that accept boolean values */
const BOOLEAN_KEYS: ConfigKey[] = [
  'fetchImages',
  // Common export
  'exportOnlyLocations',
  'exportOnlyGeneric',
  // PDF-specific
  'pdfThumbnails',
  'pdfIncludeScore',
  'pdfGroupByCountry',
  'pdfGroupByCategory',
  'pdfOnlyLocations',
  'pdfOnlyGeneric'
]
/** Config keys that accept number values */
const NUMBER_KEYS: ConfigKey[] = [
  // Common export
  'exportMinScore',
  'exportMaxActivities',
  // PDF-specific
  'pdfMinScore',
  'pdfMaxActivities'
]
/** Config keys that accept array values */
const ARRAY_KEYS: ConfigKey[] = [
  'formats',
  // Common export
  'exportCategories',
  'exportCountries',
  'exportFrom',
  // PDF-specific
  'pdfCategories',
  'pdfCountries',
  'pdfFrom'
]

/** Descriptions for config keys (for help output) */
const CONFIG_DESCRIPTIONS: Record<ConfigKey, string> = {
  // General
  cacheDir: 'Cache directory path (default: ~/.cache/chat-to-map)',
  fetchImages: 'Fetch images by default (default: false)',
  formats: 'Export formats (default: csv,excel,json,map,pdf)',
  homeCountry: 'Your home country for location context (default: detected from IP)',
  outputDir: 'Output directory for exports (default: ./output)',
  timezone: 'Your timezone (e.g. Pacific/Auckland) (default: detected from system)',

  // Common export settings
  exportCategories: 'Filter ALL exports by categories (comma-separated)',
  exportCountries: 'Filter ALL exports by countries (comma-separated)',
  exportFrom: 'Filter ALL exports by sender names (comma-separated)',
  exportStartDate: 'Filter ALL exports to on/after this date (YYYY-MM-DD)',
  exportEndDate: 'Filter ALL exports to on/before this date (YYYY-MM-DD)',
  exportMinScore: 'Min score for ALL exports (0-3)',
  exportOnlyLocations: 'Only export activities with specific locations',
  exportOnlyGeneric: 'Only export generic activities without locations',
  exportMaxActivities: 'Max activities in ALL exports, 0 for all (default: 0)',
  exportSort: 'Sort order for ALL exports: score, oldest, newest (default: score)',

  // PDF-specific settings
  pdfThumbnails: 'Include thumbnails in PDF (default: false)',
  pdfIncludeScore: 'Show score in PDF output (default: false)',
  pdfGroupByCountry: 'Group by country in PDF (default: true)',
  pdfGroupByCategory: 'Group by category in PDF (default: true)',
  pdfPageSize: 'PDF page size: A4 or Letter (default: based on country)',
  pdfTitle: 'Custom PDF title',
  pdfSubtitle: 'Custom PDF subtitle',
  pdfCategories: 'Filter PDF by categories (overrides exportCategories)',
  pdfCountries: 'Filter PDF by countries (overrides exportCountries)',
  pdfFrom: 'Filter PDF by sender names (overrides exportFrom)',
  pdfStartDate: 'Filter PDF to on/after date (overrides exportStartDate)',
  pdfEndDate: 'Filter PDF to on/before date (overrides exportEndDate)',
  pdfMinScore: 'Min score for PDF (overrides exportMinScore)',
  pdfOnlyLocations: 'Only locations in PDF (overrides exportOnlyLocations)',
  pdfOnlyGeneric: 'Only generic in PDF (overrides exportOnlyGeneric)',
  pdfMaxActivities: 'Max activities in PDF (overrides exportMaxActivities)',
  pdfSort: 'Sort order for PDF (overrides exportSort)',

  // Map-specific settings
  mapDefaultStyle: 'Default map tile style (e.g. osm, satellite, terrain)'
}

/**
 * Get the type of a config key (derived from key arrays).
 * Returns user-friendly type names for CLI help.
 */
export function getConfigType(key: ConfigKey): string {
  if (BOOLEAN_KEYS.includes(key)) return 'boolean'
  if (NUMBER_KEYS.includes(key)) return 'number'
  if (ARRAY_KEYS.includes(key)) return 'comma-separated'
  return 'string'
}

/**
 * Get the description of a config key.
 */
export function getConfigDescription(key: ConfigKey): string {
  return CONFIG_DESCRIPTIONS[key]
}

/**
 * Get XDG config directory path for chat-to-map.
 * Uses ~/.config/chat-to-map on all platforms.
 */
function getDefaultConfigDir(): string {
  return join(homedir(), '.config', 'chat-to-map')
}

/**
 * Get the config file path.
 * Priority: configFile arg > CHAT_TO_MAP_CONFIG env var > default XDG path
 */
export function getConfigPath(configFile?: string): string {
  if (configFile) {
    return configFile
  }
  if (process.env.CHAT_TO_MAP_CONFIG) {
    return process.env.CHAT_TO_MAP_CONFIG
  }
  return join(getDefaultConfigDir(), 'config.json')
}

/**
 * Load config from the config file.
 * Returns null if file doesn't exist or can't be parsed.
 */
export async function loadConfig(configFile?: string): Promise<Config | null> {
  const path = getConfigPath(configFile)
  if (!existsSync(path)) {
    return null
  }
  try {
    const content = await readFile(path, 'utf-8')
    return JSON.parse(content) as Config
  } catch {
    return null
  }
}

/**
 * Save config to the config file.
 * Creates parent directories if needed.
 */
export async function saveConfig(config: Config, configFile?: string): Promise<void> {
  const path = getConfigPath(configFile)
  await mkdir(dirname(path), { recursive: true })
  const withTimestamp: Config = {
    ...config,
    updatedAt: new Date().toISOString()
  }
  await writeFile(path, JSON.stringify(withTimestamp, null, 2))
}

/**
 * Parse a string value into the appropriate type for a config key.
 */
export function parseConfigValue(
  key: ConfigKey,
  value: string
): string | boolean | number | string[] {
  if (BOOLEAN_KEYS.includes(key)) {
    return value === 'true' || value === '1' || value === 'yes'
  }
  if (NUMBER_KEYS.includes(key)) {
    return Number.parseInt(value, 10)
  }
  if (ARRAY_KEYS.includes(key)) {
    return value.split(',').map((v) => v.trim())
  }
  return value
}

/**
 * Format a config value for display.
 */
export function formatConfigValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(',')
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}

/**
 * Check if a string is a valid config key.
 */
export function isValidConfigKey(key: string): key is ConfigKey {
  return (
    STRING_KEYS.includes(key as ConfigKey) ||
    BOOLEAN_KEYS.includes(key as ConfigKey) ||
    NUMBER_KEYS.includes(key as ConfigKey) ||
    ARRAY_KEYS.includes(key as ConfigKey)
  )
}

/**
 * Get all valid config keys (sorted alphabetically).
 */
export function getValidConfigKeys(): ConfigKey[] {
  return [...STRING_KEYS, ...BOOLEAN_KEYS, ...NUMBER_KEYS, ...ARRAY_KEYS].sort()
}

/**
 * Set a single config value and save.
 */
export async function setConfigValue(
  key: ConfigKey,
  value: string | boolean | number | string[],
  configFile?: string
): Promise<void> {
  const config = (await loadConfig(configFile)) ?? {}
  ;(config as Record<string, unknown>)[key] = value
  await saveConfig(config, configFile)
}

/**
 * Unset (remove) a config value and save.
 */
export async function unsetConfigValue(key: ConfigKey, configFile?: string): Promise<void> {
  const config = (await loadConfig(configFile)) ?? {}
  delete config[key]
  await saveConfig(config, configFile)
}

/**
 * Migrate settings from old user-settings.json location to new config.json.
 * Only migrates if old file exists and new config doesn't have the values.
 * Returns true if migration was performed.
 */
export async function migrateFromUserSettings(
  oldCacheDir?: string,
  configFile?: string
): Promise<boolean> {
  // Check for old user-settings.json in cache directory
  const cacheDir =
    oldCacheDir ?? process.env.CHAT_TO_MAP_CACHE_DIR ?? join(homedir(), '.cache', 'chat-to-map')
  const oldPath = join(cacheDir, 'user-settings.json')

  if (!existsSync(oldPath)) {
    return false
  }

  try {
    const oldContent = await readFile(oldPath, 'utf-8')
    const oldSettings = JSON.parse(oldContent) as Config

    // Load current config
    const currentConfig = (await loadConfig(configFile)) ?? {}

    // Only migrate values that aren't already set in new config
    let migrated = false
    if (oldSettings.homeCountry && !currentConfig.homeCountry) {
      currentConfig.homeCountry = oldSettings.homeCountry
      migrated = true
    }
    if (oldSettings.timezone && !currentConfig.timezone) {
      currentConfig.timezone = oldSettings.timezone
      migrated = true
    }

    if (migrated) {
      await saveConfig(currentConfig, configFile)
    }

    return migrated
  } catch {
    return false
  }
}
