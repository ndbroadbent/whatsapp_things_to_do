/**
 * Config Command
 *
 * Manage persistent CLI settings stored in ~/.config/chat-to-map/config.json.
 * Supports list, set, and unset operations.
 */

import type { CLIArgs } from '../args'
import {
  type ConfigKey,
  formatConfigValue,
  getConfigPath,
  getValidConfigKeys,
  isValidConfigKey,
  loadConfig,
  migrateFromUserSettings,
  parseConfigValue,
  setConfigValue,
  unsetConfigValue
} from '../config'
import type { Logger } from '../logger'

/**
 * Execute the config command.
 */
export async function cmdConfig(args: CLIArgs, logger: Logger): Promise<void> {
  const configFile = args.configFile

  // Attempt migration from old user-settings.json on first run
  const migrated = await migrateFromUserSettings(args.cacheDir, configFile)
  if (migrated) {
    logger.log('Migrated settings from old user-settings.json location.')
  }

  switch (args.configAction) {
    case 'list':
      await listConfig(configFile, logger)
      break
    case 'set':
      await setConfig(args.configKey, args.configValue, configFile, logger)
      break
    case 'unset':
      await unsetConfig(args.configKey, configFile, logger)
      break
  }
}

async function listConfig(configFile: string | undefined, logger: Logger): Promise<void> {
  const config = await loadConfig(configFile)
  const path = getConfigPath(configFile)

  logger.log(`\nConfig file: ${path}\n`)

  const setKeys = getValidConfigKeys().filter((key) => config?.[key] !== undefined)
  if (setKeys.length === 0) {
    logger.log('No settings configured. Run `chat-to-map config --help` for available settings.')
  } else {
    for (const key of setKeys) {
      logger.log(`  ${key}: ${formatConfigValue(config?.[key])}`)
    }
  }
}

function validateConfigKey(key: string | undefined, usage: string, logger: Logger): ConfigKey {
  if (!key) {
    logger.error(`Missing key. Usage: ${usage}`)
    process.exit(1)
  }
  if (!isValidConfigKey(key)) {
    logger.error(`Invalid key: ${key}. Valid keys: ${getValidConfigKeys().join(', ')}`)
    process.exit(1)
  }
  return key
}

async function setConfig(
  key: string | undefined,
  value: string | undefined,
  configFile: string | undefined,
  logger: Logger
): Promise<void> {
  const validKey = validateConfigKey(key, 'chat-to-map config set <key> <value>', logger)
  if (value === undefined) {
    logger.error('Missing value. Usage: chat-to-map config set <key> <value>')
    process.exit(1)
  }
  const parsedValue = parseConfigValue(validKey, value)
  await setConfigValue(validKey, parsedValue, configFile)
  logger.log(`Set ${validKey}=${formatConfigValue(parsedValue)}`)
}

async function unsetConfig(
  key: string | undefined,
  configFile: string | undefined,
  logger: Logger
): Promise<void> {
  const validKey = validateConfigKey(key, 'chat-to-map config unset <key>', logger)
  await unsetConfigValue(validKey, configFile)
  logger.log(`Unset ${validKey}`)
}
