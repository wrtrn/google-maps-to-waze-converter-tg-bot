const { Telegraf } = require('telegraf');
const { extractMapsLinks, extractCoordsFromText } = require('../lib/parse');
const { resolveMapsLink } = require('../lib/resolve');

// Initialize the bot with the token from environment variables
const bot = new Telegraf(process.env.BOT_TOKEN);

const HELP_TEXT = 'Пришлите ссылку из Google Maps (например, https://maps.app.goo.gl/...) или координаты, и я сделаю из неё ссылку для навигации в Waze!';

// Where the coordinates came from (result.source from lib/resolve.js)
const SOURCE_TEXT = {
    'link': 'координаты из ссылки',
    'place': 'точка места в Google Maps',
    'marker': 'маркер Google Maps',
    'message': 'координаты из вашего сообщения',
    'search-result': 'первый результат поиска Google Maps',
    'map-center': 'центр карты из ссылки'
};

function wazeLink({ lat, lon }) {
    return `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
}

function formatResult(result) {
    const lines = [];
    const title = result.name || result.query;

    if (result.exact) {
        if (title) lines.push(`📍 ${title}`);
        if (result.address && result.address !== title) lines.push(result.address);
        lines.push(`✅ Точно: ${SOURCE_TEXT[result.source]}`);
    } else {
        lines.push('⚠️ ПРИБЛИЗИТЕЛЬНО, проверьте перед поездкой!');
        if (result.source === 'name-search') {
            lines.push('Не удалось получить точную точку, место найдено поиском по названию. Это может быть другой филиал или другое место.');
            if (result.query) lines.push(`Искали: ${result.query}`);
            lines.push(`Нашлось: ${[result.name, result.address].filter(Boolean).join(', ')}`);
        } else {
            lines.push(`Известен только ${SOURCE_TEXT[result.source]}, а не точная точка.`);
            if (title) lines.push(`Искали: ${title}`);
        }
        lines.push(`Проверить на карте: https://www.google.com/maps/search/?api=1&query=${result.lat},${result.lon}`);
    }

    lines.push('', wazeLink(result));
    return lines.join('\n');
}

function formatFailure(link, query) {
    const lines = [`❌ Не удалось получить координаты по ссылке: ${link}`];
    if (query) {
        lines.push('', `Поиск в Waze по названию (не проверено): https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`);
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
            return reply(formatResult({ ...textCoords, exact: true, source: 'message' }));
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
            result = { ...textCoords, exact: true, source: 'message' };
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
