const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
// Убеждаемся, что WEB_APP_URL начинается с https:// и нет пробелов
let WEB_APP_URL = (process.env.WEB_APP_URL || 'https://your-app.railway.app').trim();
if (WEB_APP_URL && !WEB_APP_URL.startsWith('http')) {
  WEB_APP_URL = `https://${WEB_APP_URL}`;
}
const START_IMAGE_URL = process.env.START_IMAGE_URL;

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

  console.log(`Bot initialized in ${isWebhookMode ? 'webhook' : 'polling'} mode`);
  console.log(`WEB_APP_URL: ${WEB_APP_URL}`);

  // Обработчик всех сообщений для отладки
  bot.on('message', (msg) => {
    console.log('=== Message received ===');
    console.log('Text:', msg.text);
    console.log('Chat ID:', msg.chat.id);
  });

  // /start
  bot.onText(/\/start/, (msg) => {
    console.log('=== /start command received ===');
    console.log('Chat ID:', msg.chat.id);
    console.log('From:', msg.from?.username || msg.from?.first_name);
    const chatId = msg.chat.id;

    const welcomeText =
      '🏠 Уютный Дом — каталог проектов\n\n' +
      'Добро пожаловать в официальное приложение компании Уютный Дом!\n\n' +
      'Что здесь можно:\n' +
      '✨ Искать проекты домов из каталога domuyut38.ru\n' +
      '🔍 Фильтровать по материалу (брус, газобетон) и площади\n' +
      '📱 Смотреть фото, планировки, цены\n' +
      '🔗 Переходить к подробному описанию на сайте\n' +
      '💬 Связаться с менеджером одним кликом\n\n' +
      'Нажми «Открыть каталог» — и найди свой идеальный дом! 🏡';

    // Убеждаемся, что URL без пробелов
    const cleanWebAppUrl = WEB_APP_URL.trim();
    console.log('WEB_APP_URL:', JSON.stringify(cleanWebAppUrl));
    
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🏠 Открыть каталог',
            web_app: { url: cleanWebAppUrl },
          },
        ],
      ],
    };

    if (!START_IMAGE_URL) {
      bot.sendMessage(chatId, welcomeText, { reply_markup: replyMarkup })
        .then(() => console.log('Welcome message sent successfully'))
        .catch((err) => console.error('Error sending welcome message:', err));
      return;
    }

    bot.sendPhoto(chatId, START_IMAGE_URL, {
      caption: welcomeText,
      reply_markup: replyMarkup,
    })
      .then(() => console.log('Welcome photo sent successfully'))
      .catch((err) => console.error('Error sending welcome photo:', err));
  });

  bot.on('callback_query', (query) => {
    const chatId = query.message?.chat?.id;
    const data = query.data || '';

    if (!chatId) return;

    if (data.startsWith('project_')) {
      const projectId = data.replace('project_', '');
      bot.answerCallbackQuery(query.id, { text: 'Открываю детали проекта...' });

      const projectUrl = `${WEB_APP_URL.trim()}?project=${projectId}`;
      bot.sendMessage(chatId, '🏠 Открываю проект...', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📋 Посмотреть проект',
                web_app: { url: projectUrl },
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
    // Убеждаемся, что publicBaseUrl начинается с https:// и нет пробелов
    let webhookBaseUrl = publicBaseUrl.trim().replace(/\/$/, '');
    if (!webhookBaseUrl.startsWith('http')) {
      webhookBaseUrl = `https://${webhookBaseUrl}`;
    }
    const webhookUrl = `${webhookBaseUrl}${webhookPath}`;

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
