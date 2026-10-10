const { Telegraf } = require('telegraf');
const { extractMapsLinks, extractCoordsFromText } = require('../lib/parse');
const { resolveMapsLink } = require('../lib/resolve');

// Initialize the bot with the token from environment variables
const bot = new Telegraf(process.env.BOT_TOKEN);

const HELP_TEXT = 'Send me a Google Maps link (e.g., https://maps.app.goo.gl/...) or coordinates, and I will convert it into a Waze navigation link!';

function wazeLink({ lat, lon }) {
    return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
}

function formatResult(result) {
    const lines = [];
    const title = result.name || result.query;

    if (result.exact) {
        if (title) lines.push(`📍 ${title}`);
        if (result.address && result.address !== title) lines.push(result.address);
        lines.push(`✅ Exact: ${result.source}`);
    } else {
        lines.push('⚠️ APPROXIMATE, check before driving!');
        if (result.source === 'name search') {
            lines.push(`Couldn't read the exact point, found a place by name instead. It may be another branch or location.`);
            if (result.query) lines.push(`Requested: ${result.query}`);
            lines.push(`Found: ${[result.name, result.address].filter(Boolean).join(', ')}`);
        } else {
            lines.push(`Only the ${result.source} is known, not the exact point.`);
            if (title) lines.push(`Requested: ${title}`);
        }
        lines.push(`Check on map: https://www.google.com/maps/search/?api=1&query=${result.lat},${result.lon}`);
    }

    lines.push('', wazeLink(result));
    return lines.join('\n');
}

function formatFailure(link, query) {
    const lines = [`❌ Couldn't get coordinates for this link: ${link}`];
    if (query) {
        lines.push('', `Waze search by name (not verified): https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`);
    }
    return lines.join('\n');
}

bot.on('message', async (ctx) => {
    // Whitelist check
    const allowedIds = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : [];
    const userId = ctx.message.from.id.toString();

    // If the whitelist is set but the user is not in it, ignore the message
    if (allowedIds.length > 0 && !allowedIds.includes(userId)) {
        return;
    }

    // Links can also come in photo captions or hidden behind text (forwarded messages)
    const text = ctx.message.text || ctx.message.caption;
    if (!text) return;
    const entities = ctx.message.entities || ctx.message.caption_entities || [];

    const links = extractMapsLinks(text, entities);
    // Shared "dropped pins" come with coordinates in the text, e.g. 44°49'06.2"N 20°25'09.7"E
    const textCoords = extractCoordsFromText(text);

    const reply = (message) => ctx.reply(message, {
        reply_parameters: { message_id: ctx.message.message_id, allow_sending_without_reply: true },
        link_preview_options: { is_disabled: true }
    });

    if (links.length === 0) {
        if (textCoords) {
            return reply(formatResult({ ...textCoords, exact: true, source: 'coordinates from your message' }));
        }
        // If there are no links, politely inform the user what we expect
        return reply(HELP_TEXT);
    }

    for (const link of links) {
        let result = {};
        try {
            result = await resolveMapsLink(link);
        } catch (error) {
            console.error('Error processing link:', link, error.message);
        }

        if (result.lat === undefined && textCoords && links.length === 1) {
            result = { ...textCoords, exact: true, source: 'coordinates from your message' };
        }

        try {
            await reply(result.lat !== undefined ? formatResult(result) : formatFailure(link, result.query));
        } catch (error) {
            console.error('Failed to send reply:', error.message);
        }
    }
});

// Export the webhook handler for Vercel
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
    } catch (err) {
        console.error('Webhook error:', err);
    }
    // Always acknowledge, otherwise Telegram keeps re-sending the same update and the bot replies again and again
    res.status(200).send('OK');
};
