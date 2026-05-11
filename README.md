# Google Maps to Waze Converter Telegram Bot

A simple, serverless Telegram bot that automatically converts short Google Maps links (like `maps.app.goo.gl`) into Waze navigation links. 

Whenever a user sends a message containing a Google Maps link, the bot resolves the redirect, extracts the coordinates, and replies with a direct Waze URL ready for navigation.

## Features
- 🚀 **Serverless:** Designed to run on Vercel via Webhooks. Zero maintenance and zero cost.
- 🔗 **Auto-detection:** Finds Google Maps links anywhere in the text message.
- 📍 **Precise:** Resolves the short link and extracts exact latitude and longitude coordinates.
- ⚡ **Fast:** Responds instantly with a Waze navigation link.

## Prerequisites
- A Telegram Bot Token (get it from [@BotFather](https://t.me/BotFather))
- A [Vercel](https://vercel.com/) account (Free tier is perfect)
- GitHub account

## Deployment Guide

### 1. Vercel Deployment
1. Fork or import this repository to your GitHub account.
2. Log in to Vercel and click **Add New... -> Project**.
3. Import your repository.
4. Before clicking Deploy, expand the **Environment Variables** section and add:
   - **Name:** `BOT_TOKEN`
   - **Value:** `your_telegram_bot_token_here`
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
3. **Redirect Resolution:** It makes a GET request to the short link using `axios` to follow redirects and find the final, expanded Google Maps URL.
4. **Coordinate Extraction:** It extracts the `@latitude,longitude` coordinates from the final URL.
5. **Reply:** It constructs a `waze.com/ul?ll=LAT,LON&navigate=yes` URL and sends it back to the user.

## Built With
- [Telegraf](https://telegraf.js.org/) - Telegram Bot API framework for Node.js
- [Axios](https://axios-http.com/) - Promise based HTTP client
- [Vercel](https://vercel.com) - Serverless platform

## License
MIT