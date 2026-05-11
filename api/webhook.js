const { Telegraf } = require('telegraf');
const axios = require('axios');

// Берем токен из переменных окружения
const bot = new Telegraf(process.env.BOT_TOKEN);

// Регулярка для поиска коротких ссылок Google Maps в тексте
const URL_REGEX = /(https:\/\/maps\.app\.goo\.gl\/[a-zA-Z0-9]+)/g;

bot.on('text', async (ctx) => {
    // Проверка белого списка пользователей
    const allowedIds = process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',').map(id => id.trim()) : [];
    const userId = ctx.message.from.id.toString();

    // Если список задан, но пользователя в нем нет - игнорируем сообщение
    if (allowedIds.length > 0 && !allowedIds.includes(userId)) {
        return;
    }

    const text = ctx.message.text;
    const links = text.match(URL_REGEX);

    // Если ссылок нет - сообщаем пользователю, что мы ждем ссылку
    if (!links) {
        return ctx.reply('Отправь мне ссылку на Google Maps (например, https://maps.app.goo.gl/...), и я превращу её в ссылку для Waze!');
    }

    for (const shortLink of links) {
        try {
            // Делаем запрос. Axios по умолчанию идет по редиректам.
            const response = await axios.get(shortLink);
            const finalUrl = response.request.res.responseUrl; 

            let lat, lon;
            let query = null;

            // Пытаемся вытащить поисковый запрос или название места из итогового URL
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

            // ВСЕГДА идем в Google Places API, если есть запрос и ключ
            if (query && process.env.GOOGLE_PLACES_API_KEY) {
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
                        console.error("Places API не нашел результатов или вернул статус:", apiRes.data.status);
                    }
                } catch (apiError) {
                    console.error("Ошибка API Google Places:", apiError.message);
                }
            } else if (!process.env.GOOGLE_PLACES_API_KEY) {
                console.error("ВНИМАНИЕ: Не задан GOOGLE_PLACES_API_KEY");
            }
            
            if (lat && lon) {
                // Собираем ссылку для Waze
                const wazeLink = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
                
                await ctx.reply(`Вот ссылка для Waze:\n${wazeLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            } else {
                await ctx.reply(`К сожалению, не удалось получить координаты для этой ссылки через Google API.\n\nСсылка: ${shortLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }
        } catch (error) {
            console.error(error);
            await ctx.reply(`Произошла ошибка при обработке ссылки: ${shortLink}`);
        }
    }
});

// Экспортируем функцию для Vercel
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Ошибка в webhook:', err);
        res.status(500).send('Error');
    }
};