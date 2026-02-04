const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://your-app.railway.app';

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  
  bot.sendMessage(chatId, '🏠 Добро пожаловать в каталог уютных домов!', {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🏠 Открыть каталог',
            web_app: { url: WEB_APP_URL }
          }
        ]
      ]
    }
  });
});

// Обработка callback от inline кнопок
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data.startsWith('project_')) {
    const projectId = data.replace('project_', '');
    bot.answerCallbackQuery(query.id, {
      text: 'Открываю детали проекта...',
    });
    
    // Открываем WebApp с проектом
    bot.sendMessage(chatId, '🏠 Открываю проект...', {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '📋 Посмотреть проект',
              web_app: { url: `${WEB_APP_URL}?project=${projectId}` }
            }
          ]
        ]
      }
    });
  }
  
  if (data.startsWith('contact_')) {
    const projectId = data.replace('contact_', '');
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, 
      '📞 Для связи с менеджером по проекту, пожалуйста, напишите нам в личные сообщения или позвоните по телефону.'
    );
  }
});

console.log('Telegram bot started');

module.exports = bot;
