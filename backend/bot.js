const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-app.railway.app';

/**
 * Создает бота в режиме:
 * - webhook (production, если задан PUBLIC_BASE_URL)
 * - polling (локально)
 */
const createBot = () => {
  if (!TELEGRAM_BOT_TOKEN) return null;

  const publicBaseUrl = process.env.PUBLIC_BASE_URL; // напр: https://your-app.up.railway.app
  const isWebhookMode = Boolean(publicBaseUrl);

  const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, {
    polling: !isWebhookMode,
  });

  // /start
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    bot.sendMessage(chatId, '🏠 Добро пожаловать в каталог уютных домов!', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🏠 Открыть каталог',
              web_app: { url: WEB_APP_URL },
            },
          ],
        ],
      },
    });
  });

  bot.on('callback_query', (query) => {
    const chatId = query.message?.chat?.id;
    const data = query.data || '';

    if (!chatId) return;

    if (data.startsWith('project_')) {
      const projectId = data.replace('project_', '');
      bot.answerCallbackQuery(query.id, { text: 'Открываю детали проекта...' });

      bot.sendMessage(chatId, '🏠 Открываю проект...', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 Посмотреть проект',
                web_app: { url: `${WEB_APP_URL}?project=${projectId}` },
              },
            ],
          ],
        },
      });
      return;
    }

    if (data.startsWith('contact_')) {
      bot.answerCallbackQuery(query.id);
      bot.sendMessage(
        chatId,
        '📞 Для связи с менеджером по проекту, пожалуйста, напишите нам в личные сообщения.'
      );
    }
  });

  if (isWebhookMode) {
    const webhookPath = '/api/telegram/webhook';
    const webhookUrl = `${publicBaseUrl.replace(/\/$/, '')}${webhookPath}`;

    bot
      .setWebHook(webhookUrl)
      .then(() => console.log(`Telegram webhook set: ${webhookUrl}`))
      .catch((err) => console.error('Failed to set Telegram webhook:', err.message));
  } else {
    console.log('Telegram bot started (polling mode)');
  }

  return bot;
};

module.exports = { createBot };
