/**
 * Generic Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { scrapeGeneric } from './generic'
import { HttpRecorder } from './test-support/http-recorder'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'generic')

describe('Generic Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeGeneric', () => {
    it('scrapes hotel website metadata', async () => {
      const url = 'https://kalimaresort.com/'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Expected success')

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://kalimaresort.com/",
          "categories": [
            "kalimaresort.com",
          ],
          "contentId": null,
          "creator": null,
          "description": "Kalima Resort & Spa is the ultimate hillside hideaway, just minutes away from Patong Beach, a 5-star resort in Phuket with amazing facilities.",
          "hashtags": [],
          "imageUrl": "https://www.kalimaresort.com/images/3021.jpg",
          "rawData": {
            "jsonLd": [],
            "og": {
              "description": "Kalima Resort & Spa is the ultimate hillside hideaway, just minutes away from Patong Beach, a 5-star resort in Phuket with amazing facilities.",
              "image": "https://www.kalimaresort.com/images/3021.jpg",
              "title": "Kalima Resort & Spa - 5-Star Resort in Phuket",
              "url": "https://www.kalimaresort.com/homepage",
            },
          },
          "suggestedKeywords": [],
          "title": "Kalima Resort & Spa - 5-Star Resort in Phuket",
        }
      `)
    })

    it('returns finalUrl when shortened URL redirects to unreachable domain', async () => {
      const url = 'https://tinyurl.com/a6vzxrj4'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(false)
      if (result.ok) throw new Error('Expected failure')

      expect(result.error).toMatchInlineSnapshot(`
        {
          "finalUrl": "https://fakesiteexample.com/blog/go-hiking-at-yellowstone-tips",
          "message": "fetch failed",
          "type": "network",
          "url": "https://tinyurl.com/a6vzxrj4",
        }
      `)
    })

    it('scrapes IMDB movie page with og:image', async () => {
      // The Matrix
      const url = 'https://www.imdb.com/title/tt0133093/'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`)

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://www.imdb.com/title/tt0133093/",
          "categories": [
            "imdb.com",
          ],
          "contentId": null,
          "creator": null,
          "description": "2h 16m | R",
          "hashtags": [],
          "imageUrl": "https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDRhXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg",
          "rawData": {
            "jsonLd": [
              {
                "@context": "https://schema.org",
                "@type": "Movie",
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "bestRating": 10,
                  "ratingCount": 2217264,
                  "ratingValue": 8.7,
                  "worstRating": 1,
                },
                "contentRating": "R",
                "creator": [
                  {
                    "@type": "Organization",
                    "url": "https://www.imdb.com/company/co0002663/",
                  },
                  {
                    "@type": "Organization",
                    "url": "https://www.imdb.com/company/co0108864/",
                  },
                  {
                    "@type": "Organization",
                    "url": "https://www.imdb.com/company/co0060075/",
                  },
                ],
                "datePublished": "1999-03-31",
                "description": "When a beautiful stranger leads computer hacker Neo to a forbidding underworld, he discovers the shocking truth--the life he knows is the elaborate deception of an evil cyber-intelligence.",
                "duration": "PT2H16M",
                "genre": [
                  "Action",
                  "Sci-Fi",
                ],
                "image": "https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDRhXkEyXkFqcGc@._V1_.jpg",
                "keywords": "war with machines,artificial reality,simulated reality,dystopia,questioning reality",
                "name": "The Matrix",
                "review": {
                  "@type": "Review",
                  "author": {
                    "@type": "Person",
                    "name": "suryanmukul",
                  },
                  "dateCreated": "2020-10-01",
                  "inLanguage": "English",
                  "itemReviewed": {
                    "@type": "Movie",
                    "url": "https://www.imdb.com/title/tt0133093/",
                  },
                  "name": "Benchmark forever.",
                  "reviewBody": "The Matrix - 1999

        This was a real change in filmmaking. Like watching it again in 2020, i.e. after 21 years and it still feels fresh. Iconic scenes are still having benchmarks setting up.

        If we say it sci-fi at its best, it won&apos;t be wrong. The hype was real, it is still not easy to match the level of Matrix where we experience the connection of humans and science, that too with amazing action fight and chase scenes, not just normal scenes they were, multiple exposures, slow motion 3D moves, Oh My God, and it&apos;s understandable as well like what are the characters up to and what storyline they are entering into. The script was very well written and executed otherwise it could have been a mess. A special appreciation in managing the theme with those black color costumes and a scientific zone with unimaginable equipment and props doing unbelievable things in the two worlds created. No spoilers, but the action scenes in the climax where the protagonist goes to save someone from agents are really breathtaking. The technology used at its best.

        A salute to Wachowski Brothers and the team for creating this masterpiece. It will be a great competition and motivation as well for many films coming in the future.",
                  "reviewRating": {
                    "@type": "Rating",
                    "bestRating": 10,
                    "ratingValue": 10,
                    "worstRating": 1,
                  },
                },
                "trailer": {
                  "@type": "VideoObject",
                  "description": "A computer hacker learns from mysterious rebels about the true nature of his reality and his role in the war against its controllers. ",
                  "duration": "PT2M26S",
                  "embedUrl": "https://www.imdb.com/video/vi1032782617/",
                  "name": "Theatrical Trailer",
                  "thumbnail": {
                    "@type": "ImageObject",
                    "contentUrl": "https://m.media-amazon.com/images/M/MV5BNDQ4NTRmN2ItYjgzMS00MzY3LWEwNmYtYmE2ODllZDdhNGI1XkEyXkFqcGdeQXdvbmtpbQ@@._V1_.jpg",
                  },
                  "thumbnailUrl": "https://m.media-amazon.com/images/M/MV5BNDQ4NTRmN2ItYjgzMS00MzY3LWEwNmYtYmE2ODllZDdhNGI1XkEyXkFqcGdeQXdvbmtpbQ@@._V1_.jpg",
                  "uploadDate": "2008-12-19T07:12:53Z",
                  "url": "https://www.imdb.com/video/vi1032782617/",
                },
                "url": "https://www.imdb.com/title/tt0133093/",
              },
            ],
            "og": {
              "description": "2h 16m | R",
              "image": "https://m.media-amazon.com/images/M/MV5BN2NmN2VhMTQtMDNiOS00NDlhLTliMjgtODE2ZTY0ODQyNDRhXkEyXkFqcGc@._V1_FMjpg_UX1000_.jpg",
              "image:height": "1502.857142857143",
              "image:width": "1000",
              "locale": "en_US",
              "locale:alternate": "de_DE",
              "site_name": "IMDb",
              "title": "The Matrix (1999) ⭐ 8.7 | Action, Sci-Fi",
              "type": "video.movie",
              "url": "https://www.imdb.com/title/tt0133093/",
            },
          },
          "suggestedKeywords": [],
          "title": "The Matrix (1999) ⭐ 8.7 | Action, Sci-Fi",
        }
      `)
    })

    it('scrapes BoardGameGeek page with og:image', async () => {
      // Wingspan board game
      const url = 'https://boardgamegeek.com/boardgame/266192/wingspan'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`)

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://boardgamegeek.com/boardgame/266192/wingspan",
          "categories": [
            "boardgamegeek.com",
          ],
          "contentId": null,
          "creator": null,
          "description": "Attract a beautiful and diverse collection of birds to your wildlife preserve.",
          "hashtags": [],
          "imageUrl": "https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__opengraph/img/SWhgZcxhlWQ72BgIbBqNpdb3NWM=/0x831:1750x1750/fit-in/1200x630/filters:strip_icc()/pic4458123.jpg",
          "rawData": {
            "jsonLd": [],
            "og": {
              "description": "Attract a beautiful and diverse collection of birds to your wildlife preserve.",
              "image": "https://cf.geekdo-images.com/yLZJCVLlIx4c7eJEWUNJ7w__opengraph/img/SWhgZcxhlWQ72BgIbBqNpdb3NWM=/0x831:1750x1750/fit-in/1200x630/filters:strip_icc()/pic4458123.jpg",
              "site_name": "BoardGameGeek",
              "title": "Wingspan",
              "type": "website",
              "url": "https://boardgamegeek.com/boardgame/266192/wingspan",
            },
          },
          "suggestedKeywords": [],
          "title": "Wingspan",
        }
      `)
    })

    it('scrapes Steam game page with og:image', async () => {
      // Baldur's Gate 3
      const url = 'https://store.steampowered.com/app/1086940/Baldurs_Gate_3/'
      const result = await scrapeGeneric(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error(`Expected success, got: ${result.error.message}`)

      expect(result.metadata).toMatchInlineSnapshot(`
        {
          "canonicalUrl": "https://store.steampowered.com/app/1086940/Baldurs_Gate_3/",
          "categories": [
            "store.steampowered.com",
          ],
          "contentId": null,
          "creator": null,
          "description": "Baldur’s Gate 3 is a story-rich, party-based RPG set in the universe of Dungeons & Dragons, where your choices shape a tale of fellowship and betrayal, survival and sacrifice, and the lure of absolute power.",
          "hashtags": [],
          "imageUrl": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/59827b3d0abf2f29adacfe72fdfd11059d6974e2/capsule_616x353.jpg?t=1765505948",
          "rawData": {
            "jsonLd": [],
            "og": {
              "description": "Baldur’s Gate 3 is a story-rich, party-based RPG set in the universe of Dungeons & Dragons, where your choices shape a tale of fellowship and betrayal, survival and sacrifice, and the lure of absolute power.",
              "image": "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1086940/59827b3d0abf2f29adacfe72fdfd11059d6974e2/capsule_616x353.jpg?t=1765505948",
              "site": "Steam",
              "title": "Baldur's Gate 3 on Steam",
              "type": "website",
              "url": "https://store.steampowered.com/app/1086940/Baldurs_Gate_3/",
            },
          },
          "suggestedKeywords": [],
          "title": "Baldur's Gate 3 on Steam",
        }
      `)
    })
  })
})
