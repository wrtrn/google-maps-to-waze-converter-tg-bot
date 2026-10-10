# Google Maps to Waze Converter Telegram Bot

A simple, serverless Telegram bot that automatically converts short Google Maps links (like `maps.app.goo.gl`) into Waze navigation links. 

Whenever a user sends a message containing a Google Maps link, the bot resolves the redirect, extracts the precise coordinates, and replies with a direct Waze URL ready for navigation.

## Features
- 🚀 **Serverless:** Designed to run on Vercel via Webhooks. Zero maintenance and low/zero cost.
- 🔗 **Auto-detection:** Finds `maps.app.goo.gl`, `goo.gl/maps` and full `google.com/maps` links anywhere in the message, including photo captions and links hidden behind text. Plain coordinates (`44.818399, 20.419373` or `44°49'06.2"N 20°25'09.7"E`) work too.
- 📍 **Exact Coordinates:** Reads the pin from the link itself, or looks the place up by its Google Maps place ID, so the point is exactly where Google Maps shows it (not "a place with a similar name").
- ⚠️ **Accuracy Indicator:** Every reply says whether the point is ✅ exact or ⚠️ approximate. Approximate results (name search, map center) show what was found and a "check on map" link, so you can verify before driving.
- 🛡️ **Private Mode (Whitelist):** Can be configured to only respond to specific Telegram User IDs, ignoring everyone else.
- ⚡ **Fast:** Responds instantly with a Waze navigation link.

## Prerequisites
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))
- A [Vercel](https://vercel.com/) account (Free tier is perfect)
- A Google Cloud account with the **Places API** enabled and an API Key (Optional, used only as an approximate fallback when the exact point can't be read).

## Deployment Guide

### 1. Vercel Deployment
1. Fork or import this repository to your GitHub account.
2. Log in to Vercel and click **Add New... -> Project**.
3. Import your repository.
4. Before clicking Deploy, expand the **Environment Variables** section and add:
   - `BOT_TOKEN`: `your_telegram_bot_token_here` **(Required)**
   - `GOOGLE_PLACES_API_KEY`: `your_google_cloud_api_key` *(Optional, approximate name search fallback)*
   - `ALLOWED_USER_IDS`: `123456789,987654321` *(Optional, comma-separated list of Telegram User IDs allowed to use the bot)*
5. Click **Deploy**.
6. Once deployed, note your Vercel project domain (e.g., `https://your-project.vercel.app`).

### 2. Set up Telegram Webhook
To tell Telegram where to send updates, simply open your web browser and navigate to the following URL (replace the placeholders with your actual Bot Token and Vercel domain):

```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_DOMAIN>/api/webhook
```

*Note: Ensure there is no space between `bot` and your token. The URL must end with `/api/webhook`.*

If successful, the browser will display: `{"ok":true,"result":true,"description":"Webhook was set"}`.

## How it works
1. **Telegram to Vercel:** When someone messages the bot, Telegram sends an HTTP POST request to the `/api/webhook` endpoint on Vercel.
2. **Link Detection:** The bot collects Google Maps links from the message text, caption and hyperlinks, plus any coordinates written in the text.
3. **Redirect Resolution:** Short links are followed hop by hop (with a TelegramBot User-Agent) until the full Google Maps URL is reached. The heavy Maps page itself is not downloaded.
4. **Coordinate Extraction** (first match wins):
   1. ✅ Exact pin in the URL: place marker (`!3d…!4d…`), dropped pin (`?q=lat,lon`), directions destination.
   2. ✅ Exact place location by place ID (`0x…:0x…` in links shared from the mobile app) via the same endpoint the Google Maps web app uses.
   3. ✅ Exact marker from the page's Open Graph preview image (places without photos).
   4. ⚠️ Google Places API text search by the place name (may find another branch of a chain).
   5. ⚠️ Top Google Maps search result or the map center (`@lat,lon`) of the link.
   6. ✅ Coordinates written in the message text, if the link itself could not be resolved.
5. **Reply:** It sends a `waze.com/ul?ll=LAT,LON&navigate=yes` URL with the place name, address and the accuracy label. If nothing is found, it offers a Waze search by the place name.

## Development
```
npm install
npm test
```
Parsing logic lives in `lib/parse.js` (covered by offline tests in `test/`), network lookups in `lib/resolve.js`.

## Built With
- [Telegraf](https://telegraf.js.org/) - Telegram Bot API framework for Node.js
- [Axios](https://axios-http.com/) - Promise based HTTP client
- [Vercel](https://vercel.com) - Serverless platform

## License
MIT