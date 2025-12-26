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
  /** When settings were last updated */
  updatedAt?: string | undefined
}

/** Valid config keys for type-safe access */
export type ConfigKey = keyof Omit<Config, 'updatedAt'>

/** Config keys that accept string values */
const STRING_KEYS: ConfigKey[] = ['homeCountry', 'timezone', 'cacheDir', 'outputDir']
/** Config keys that accept boolean values */
const BOOLEAN_KEYS: ConfigKey[] = ['fetchImages']
/** Config keys that accept array values */
const ARRAY_KEYS: ConfigKey[] = ['formats']

/** Descriptions for config keys (for help output) */
const CONFIG_DESCRIPTIONS: Record<ConfigKey, string> = {
  homeCountry: 'Your home country for location context (default: detected from IP)',
  timezone: 'Your timezone (e.g. Pacific/Auckland) (default: detected from system)',
  fetchImages: 'Fetch images by default (default: false)',
  cacheDir: 'Cache directory path (default: ~/.cache/chat-to-map)',
  outputDir: 'Output directory for exports (default: ./output)',
  formats: 'Export formats (default: csv,excel,json,map,pdf)'
}

/**
 * Get the type of a config key (derived from key arrays).
 * Returns user-friendly type names for CLI help.
 */
export function getConfigType(key: ConfigKey): string {
  if (BOOLEAN_KEYS.includes(key)) return 'boolean'
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
export function parseConfigValue(key: ConfigKey, value: string): string | boolean | string[] {
  if (BOOLEAN_KEYS.includes(key)) {
    return value === 'true' || value === '1' || value === 'yes'
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
    ARRAY_KEYS.includes(key as ConfigKey)
  )
}

/**
 * Get all valid config keys.
 */
export function getValidConfigKeys(): ConfigKey[] {
  return [...STRING_KEYS, ...BOOLEAN_KEYS, ...ARRAY_KEYS]
}

/**
 * Set a single config value and save.
 */
export async function setConfigValue(
  key: ConfigKey,
  value: string | boolean | string[],
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
