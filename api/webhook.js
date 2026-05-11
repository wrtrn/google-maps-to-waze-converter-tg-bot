const { Telegraf } = require('telegraf');
const axios = require('axios');

// Initialize the bot with the token from environment variables
const bot = new Telegraf(process.env.BOT_TOKEN);

// Regular expression to find short Google Maps links in text
const URL_REGEX = /(https:\/\/maps\.app\.goo\.gl\/[a-zA-Z0-9]+)/g;

// Regular expression to extract coordinates from the final long link (supports different formats)
const COORDS_REGEX = /@?(-?\d+\.\d+)[,%20\+]+(-?\d+\.\d+)/;

bot.on('text', async (ctx) => {
    // Whitelist check
    const allowedIds = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : [];
    const userId = ctx.message.from.id.toString();

    // If the whitelist is set but the user is not in it, ignore the message
    if (allowedIds.length > 0 && !allowedIds.includes(userId)) {
        return;
    }

    const text = ctx.message.text;
    const links = text.match(URL_REGEX);

    // If there are no links, politely inform the user what we expect
    if (!links) {
        return ctx.reply('Send me a Google Maps link (e.g., https://maps.app.goo.gl/...), and I will convert it into a Waze navigation link!');
    }

    for (const shortLink of links) {
        try {
            // Make the request. Axios follows redirects by default.
            // Add TelegramBot headers so Google doesn't block the request from Vercel datacenter IPs.
            const response = await axios.get(shortLink, {
                headers: {
                    'User-Agent': 'TelegramBot (like TwitterBot)',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            const finalUrl = response.request.res.responseUrl; 

            let lat, lon;

            // 1. Try to find exact marker coordinates (!3d... !4d...)
            const markerMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            
            if (markerMatch) {
                lat = markerMatch[1];
                lon = markerMatch[2];
            } else {
                // 2. Fallback: find map center coordinates
                const match = finalUrl.match(COORDS_REGEX);
                if (match) {
                    lat = match[1];
                    lon = match[2];
                }
            }

            // 3. If coordinates are not found in the URL, try to extract a search query or place name from the final URL and hit the API
            if ((!lat || !lon) && process.env.GOOGLE_PLACES_API_KEY) {
                let query = null;
                const qMatch = finalUrl.match(/[?&]q=([^&]+)/);
                const placeMatch = finalUrl.match(/\/place\/([^\/]+)/);
                const searchMatch = finalUrl.match(/\/search\/([^\/]+)/);

                if (qMatch) {
                    query = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
                } else if (placeMatch) {
                    query = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
                } else if (searchMatch) {
                    query = decodeURIComponent(searchMatch[1].replace(/\+/g, ' '));
                }

                if (query) {
                    try {
                        const apiRes = await axios.get("https://maps.googleapis.com/maps/api/place/textsearch/json", {
                            params: {
                                query: query,
                                key: process.env.GOOGLE_PLACES_API_KEY
                            }
                        });
                        
                        if (apiRes.data.status === 'OK' && apiRes.data.results.length > 0) {
                            const location = apiRes.data.results[0].geometry.location;
                            lat = location.lat;
                            lon = location.lng;
                        } else {
                            console.error("Places API found no results or returned status:", apiRes.data.status);
                        }
                    } catch (apiError) {
                        console.error("Google Places API error:", apiError.message);
                    }
                }
            } else if (!lat && !lon && !process.env.GOOGLE_PLACES_API_KEY) {
                console.error("WARNING: GOOGLE_PLACES_API_KEY is not set.");
            }
            
            if (lat && lon) {
                // Build the Waze link
                const wazeLink = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
                
                await ctx.reply(`Here is your Waze link:\n${wazeLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            } else {
                await ctx.reply(`Unfortunately, I couldn't get the coordinates for this link. It might be a generic search link rather than a specific location.\n\nLink: ${shortLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }
        } catch (error) {
            console.error("Error processing link:", shortLink, error.message);
            await ctx.reply(`An error occurred while processing the link: ${shortLink}`);
        }
    }
});

// Export the webhook handler for Vercel
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).send('Error');
    }
};