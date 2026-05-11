const { Telegraf } = require('telegraf');
const axios = require('axios');

// Берем токен из переменных окружения (настроим в Vercel)
const bot = new Telegraf(process.env.BOT_TOKEN);

// Регулярка для поиска коротких ссылок Google Maps в тексте
const URL_REGEX = /(https:\/\/maps\.app\.goo\.gl\/[a-zA-Z0-9]+)/g;

// Регулярка для вытаскивания координат из финальной длинной ссылки (поддерживает разные форматы)
const COORDS_REGEX = /@?(-?\d+\.\d+)[,%20\+]+(-?\d+\.\d+)/;

bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    const links = text.match(URL_REGEX);

    // Если ссылок нет - сообщаем пользователю, что мы ждем ссылку
    if (!links) {
        return ctx.reply('Отправь мне ссылку на Google Maps (например, https://maps.app.goo.gl/...), и я превращу её в ссылку для Waze!');
    }

    for (const shortLink of links) {
        try {
            // Делаем запрос. Axios по умолчанию идет по редиректам.
            // Нам нужен именно финальный URL, куда нас перекинуло.
            const response = await axios.get(shortLink);
            const finalUrl = response.request.res.responseUrl; 

            let lat, lon;

            // Сначала ищем точные координаты маркера (!3d... !4d...)
            // Это решает проблему, когда @ указывает на центр экрана, а не на сам маркер заведения
            const markerMatch = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
            
            if (markerMatch) {
                lat = markerMatch[1];
                lon = markerMatch[2];
            } else {
                // Если точного маркера нет, используем фоллбэк: ищем координаты центра экрана или поиска
                const match = finalUrl.match(COORDS_REGEX);
                if (match) {
                    lat = match[1];
                    lon = match[2];
                }
            }
            
            if (lat && lon) {
                // Собираем ссылку для Waze
                const wazeLink = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
                
                await ctx.reply(`Вот ссылка для Waze:\n${wazeLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            } else {
                await ctx.reply(`К сожалению, этот формат ссылок Google Maps пока не поддерживается (не удалось извлечь точные координаты). Скорее всего, это ссылка на "Поиск", а не на конкретную точку.\n\nСсылка: ${shortLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            }
        } catch (error) {
            console.error(error);
            await ctx.reply(`Произошла ошибка при обработке ссылки: ${shortLink}`);
        }
    }
});

// Экспортируем функцию для Vercel (чтобы он мог передать сюда вебхук)
module.exports = async (req, res) => {
    try {
        await bot.handleUpdate(req.body);
        res.status(200).send('OK');
    } catch (err) {
        console.error('Ошибка в webhook:', err);
        res.status(500).send('Error');
    }
};