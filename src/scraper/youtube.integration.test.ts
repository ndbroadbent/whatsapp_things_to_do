/**
 * YouTube Scraper Integration Tests
 *
 * Uses HttpRecorder for automatic fixture recording/replay.
 * First run makes real requests and saves fixtures.
 * Subsequent runs replay from fixtures (instant, offline).
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { HttpRecorder } from './test-support/http-recorder'
import { scrapeYouTube } from './youtube'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', '..', 'tests', 'fixtures', 'youtube')

describe('YouTube Scraper Integration', () => {
  let recorder: HttpRecorder

  beforeAll(() => {
    recorder = new HttpRecorder(FIXTURES_DIR)
  })

  describe('scrapeYouTube', () => {
    it('scrapes cooking video metadata', async () => {
      const url = 'https://www.youtube.com/watch?v=oQ-Vc_xQrZk'
      const result = await scrapeYouTube(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        const { rawData, ...metadata } = result.metadata
        expect(metadata).toMatchInlineSnapshot(`
          {
            "canonicalUrl": "https://www.youtube.com/watch?v=oQ-Vc_xQrZk",
            "categories": [
              "People & Blogs",
            ],
            "contentId": "oQ-Vc_xQrZk",
            "creator": "Super Recipes",
            "creatorId": "UCd11fwh2xxUzSuDFwp0PFeg",
            "description": "DID YOU LIKE OUR RECIPE?

          AFTER TRYING THIS RECIPE I ONLY WANT TO EAT BEEF MINCE THIS WAY.


          INGREDIENTS:
          1 KG OF BEEF MINCE 
          AND 3 EGGS
          BLACK PEPPER
          ORÉGANO
          MILD PAPRIKA
          SALT
          3 GARLIC CLOVES
          1 GRATED ONION
          3 BOILED AND PEELED POTATOES 
          1 CUP OF BREADCRUMB 
          HERBS
          OIL
          200 G OF CREAM CHEESE 
          GRATED MOZZARELLA CHEESE
          TOMATO SLICES
          OIL

          ACCESS OUR INSTAGRAM:
          https://www.instagram.com/superrecipess/

          ACCESS OUR TIK TOK:
          https://vm.tiktok.com/ZMeRSuLTT/

          ACCESS OUR FACEBOOK:
          https://www.facebook.com/supercreativee",
            "hashtags": [],
            "imageUrl": "https://i.ytimg.com/vi/oQ-Vc_xQrZk/maxresdefault.jpg",
            "suggestedKeywords": [
              "AFTER TRYING",
              "THIS RECIPE",
              "I ONLY",
              "WANT TO EAT",
              "BEEF MINCE",
              "THIS WAY.",
              "GASTRONOMY",
              "RECIPE",
              "FOOD",
            ],
            "title": "AFTER TRYING THIS RECIPE, I ONLY WANT TO EAT BEEF MINCE THIS WAY.",
          }
        `)
      }
    })

    it('scrapes shortened youtu.be URL with si parameter', async () => {
      const url = 'https://youtu.be/juZi4ODQFFA?si=M6FbE6el5TJyNyV8'
      const result = await scrapeYouTube(url, { fetch: recorder.fetch })

      expect(result.ok).toBe(true)
      if (result.ok) {
        const { rawData, ...metadata } = result.metadata
        expect(metadata).toMatchInlineSnapshot(`
          {
            "canonicalUrl": "https://www.youtube.com/watch?v=juZi4ODQFFA",
            "categories": [
              "Travel & Events",
            ],
            "contentId": "juZi4ODQFFA",
            "creator": "Dane and Stacey",
            "creatorId": "UCmnpMr4Md5CgZ5MdlghTYqA",
            "description": "The only video you'll need for the best things to do in Queenstown! This isn’t just a couple of recommendations, this is years of local knowledge and days of editing to share the 12 best things to do in Queenstown after more trips than we can count! Want more? Unlock our full guide for over 50 more recommendations and a map view to take on the go: https://geni.us/queenstownguide ⬇ See below for more links⬇  

          If you’ve been following for a while now you know how much we love Queenstown. Like we said at the start of the vlog, even as a couple of Kiwis it’s impressive that every time we visit there’s new things to do and must do spots to visit. That’s kind of the reason we’ve waited so long to make this video, despite it being one of our most requested after all these years on YouTube! 

          Got an opinion on the list of best things to do we’ve picked? We’d love to hear your thoughts, just leave a comment below and we’ll be sure to get back to ya!

          Our full Queenstown guide will make sure you:
          → Save weeks of your life aimlessly researching
          → Have 10x more recommendations than what we mentioned in this video guide
          → Get instant access to years of local knowledge
          → Know the best things to do, where to eat & drink and the best places to stay
          → Have a digital map of all locations (including opening hours)
          → Travel with a mobile guide and app you can open on-the-go 
          → And ultimately have an amazing and stress-free holiday!
          → Take a look here: https://geni.us/queenstownguide

          Cheap Flights To Queenstown: https://geni.us/GbF5UA
          Watch Our Queenstown Vlogs: https://youtu.be/h19YheA5Ikk

          Things we mentioned:
          Skyline Gondola & Luge - https://www.skyline.co.nz/en/queenstown/
          Queenstown Ice Bar - https://geni.us/E2MDu1
          Lake Wakatipu Tours - https://geni.us/hJAE6
          Jet Boating - https://geni.us/hVAd0y
          Iconic Burger - https://fergburger.com/
          Queenstown Hill Hike: https://www.newzealand.com/int/feature/queenstown-hill-time-walk/
          Bobs Cove: https://goo.gl/maps/4ap9C3pCtzAhqFof8
          Onsen hot pools: https://www.onsen.co.nz/
          Around The Basin bike tour: https://www.aroundthebasin.co.nz/product/arrowtown-to-queenstown
          Vineyard tours: https://geni.us/TMrlWSI
          Helicopter tour: https://geni.us/iu17k3
          Get Extreme: https://geni.us/nFp2
          Glenorchy trips: https://geni.us/BZrln9D
          Milford Sound tours: https://geni.us/3PZhW

          Note — There's affiliate links for things we know you'll love. It costs you nothing more, but we might get a commission for anything you purchase.
          ▬▬▬

          |   S U P P O R T
          + Join Our Exclusive Patreon Community — https://geni.us/2kLq3
          + Did we help with your planning? Enjoying our videos? Consider buying us a coffee to say thanks here — https://geni.us/vIlyS
          ▬▬▬
          CHAPTERS
          00:00 Intro
          00:53 Skyline
          01:34 Ice Bar
          02:23 The Lake
          03:15 Jet Boating
          03:50 Iconic Burger
          04:56 Walks and Hikes
          05:52 Hit The Slopes
          06:22 Get Steamy
          06:55 Vineyards
          07:41 From Above
          08:29 Get Extreme
          09:23 Day Trips
          11:13 Want More?
          ▬▬▬

          |   F R I E N D S
          + Instagram — http://instagram.com/danegerandstacey
          + Our Monthly Email — https://danegerandstacey.com/friends
          + Business Contact — info@danegerandstacey.com
          ▬▬▬

          Imagery Credits:
          — This video features footage supplied from Tourism New Zealand and https://queenstownnz.co.nz
          — Credit for the like button to: https://www.vecteezy.com/video/11779802-elegant-youtube-like-button-animation
          ▬▬▬

          #Queenstown #NewZealand",
            "hashtags": [
              "queenstown",
              "newzealand",
            ],
            "imageUrl": "https://i.ytimg.com/vi_webp/juZi4ODQFFA/maxresdefault.webp",
            "suggestedKeywords": [
              "daneger and stacey",
              "queenstown things to do",
              "queenstown what to do",
              "things to do in queenstown nz",
              "things to do in queenstown new zealand",
              "best things to do in queenstown",
              "things to do in queenstown",
              "things to do queenstown",
              "queenstown activity",
              "what to do in queenstown",
              "things to do queenstown new zealand",
              "queenstown must do",
              "best things to do queenstown",
              "queenstown to do",
              "Queenstown",
              "queenstown new zealand",
              "queenstown video",
              "queenstown travel",
              "new zealand",
              "queenstown guide",
            ],
            "title": "12 Top Things To Do In QUEENSTOWN, New Zealand",
          }
        `)
      }
    })
  })
})
