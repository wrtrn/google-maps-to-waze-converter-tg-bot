# Google Maps to Waze Converter Telegram Bot

A simple, serverless Telegram bot that automatically converts short Google Maps links (like `maps.app.goo.gl`) into Waze navigation links. 

Whenever a user sends a message containing a Google Maps link, the bot resolves the redirect, extracts the precise coordinates, and replies with a direct Waze URL ready for navigation.

## Features
- 🚀 **Serverless:** Designed to run on Vercel via Webhooks. Zero maintenance and low/zero cost.
- 🔗 **Auto-detection:** Finds Google Maps links anywhere in the text message.
- 📍 **Hybrid Precision:** Extracts exact coordinates directly from the URL if available. For "blind" iOS links without coordinates, it automatically falls back to the **Google Places API** for 100% accuracy.
- 🛡️ **Private Mode (Whitelist):** Can be configured to only respond to specific Telegram User IDs, ignoring everyone else.
- ⚡ **Fast:** Responds instantly with a Waze navigation link.

## Prerequisites
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))
- A [Vercel](https://vercel.com/) account (Free tier is perfect)
- A Google Cloud account with the **Places API (New)** enabled and an API Key (Optional, but highly recommended for iOS link support).

## Deployment Guide

### 1. Vercel Deployment
1. Fork or import this repository to your GitHub account.
2. Log in to Vercel and click **Add New... -> Project**.
3. Import your repository.
4. Before clicking Deploy, expand the **Environment Variables** section and add:
   - `BOT_TOKEN`: `your_telegram_bot_token_here` **(Required)**
   - `GOOGLE_PLACES_API_KEY`: `your_google_cloud_api_key` *(Optional, used to resolve links that hide coordinates)*
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
2. **Regex Matching:** The bot checks the message text for `maps.app.goo.gl` links.
3. **Redirect Resolution:** It makes a GET request to the short link using `axios` to follow redirects and find the final, expanded Google Maps URL. It uses a specific User-Agent to prevent Google from serving default datacenter coordinates.
4. **Coordinate Extraction:** 
   - First, it looks for exact marker coordinates (`!3d` and `!4d`) in the URL.
   - Second, it looks for map center coordinates (`@lat,lon`).
   - Finally, if no coordinates are present, it extracts the search query from the URL and requests the exact location from the **Google Places API**.
5. **Reply:** It constructs a `waze.com/ul?ll=LAT,LON&navigate=yes` URL and sends it back to the user.

## Built With
- [Telegraf](https://telegraf.js.org/) - Telegram Bot API framework for Node.js
- [Axios](https://axios-http.com/) - Promise based HTTP client
- [Vercel](https://vercel.com) - Serverless platform

## License
MIT