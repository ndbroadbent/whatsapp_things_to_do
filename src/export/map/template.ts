/**
 * Map HTML Template
 *
 * Generates the HTML shell that loads data.js and app.js.
 */

import HTML_TEMPLATE from './index.html.template' with { type: 'text' }
import MAP_STYLES from './styles.css.template' with { type: 'text' }

/**
 * Generate the HTML template.
 * The template expects mapData to be defined globally via data.js.
 */
export function generateMapHTML(options: { inline?: { data: string; app: string } } = {}): string {
  const dataScript = options.inline
    ? `<script>${options.inline.data}</script>`
    : '<script src="data.js"></script>'

  const appScript = options.inline
    ? `<script>${options.inline.app}</script>`
    : '<script src="app.js"></script>'

  return HTML_TEMPLATE.replace('{{STYLES}}', MAP_STYLES)
    .replace('{{DATA_SCRIPT}}', dataScript)
    .replace('{{APP_SCRIPT}}', appScript)
}
