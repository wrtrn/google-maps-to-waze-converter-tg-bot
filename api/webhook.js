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

            // Ищем координаты в итоговом URL
            const match = finalUrl.match(COORDS_REGEX);
            
            if (match) {
                const lat = match[1];
                const lon = match[2];
                // Собираем ссылку для Waze
                const wazeLink = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
                
                await ctx.reply(`Вот ссылка для Waze:\n${wazeLink}`, {
                    reply_to_message_id: ctx.message.message_id
                });
            } else {
                await ctx.reply(`Не смог найти точные координаты по ссылке: ${shortLink}`, {
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