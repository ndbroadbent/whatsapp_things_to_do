/**
 * Shared Gemini AI client for image filtering.
 *
 * Used by both Pixabay and Wikipedia image filters.
 */

import { httpFetch } from '../http'

const GEMINI_MODEL = 'gemini-2.0-flash'
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

interface GoogleAIResponse {
  candidates: Array<{
    content: {
      parts: Array<{ text: string }>
      role: string
    }
  }>
}

/**
 * Call Gemini API with a prompt and return the response text.
 *
 * @param prompt - The prompt to send to Gemini
 * @param apiKey - Google AI API key
 * @returns Response text or null if the call failed
 */
export async function callGemini(prompt: string, apiKey: string): Promise<string | null> {
  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`

  try {
    const response = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    })

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as GoogleAIResponse
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? null
  } catch {
    return null
  }
}
