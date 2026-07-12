import { getSettings, updateBotStatus, addLog, getUserSettings, updateUserSettings } from './db.js';
import { customizeConfig } from './configParser.js';

let pollingActive = false;
let lastUpdateId = 0;

// State machine for in-chat user configuration
// Tracks which user is currently typing a new setting value
const userStates: Record<string, 'waiting_pattern' | 'waiting_ad' | 'waiting_caption' | null> = {};

// Helper to send text messages to Telegram
async function sendTextMessage(token: string, chatId: number, text: string, replyToMessageId?: number) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML'
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('Error sending text message:', err);
  }
}

// Helper to send message with custom reply markup (inline keyboard)
async function sendMessageWithKeyboard(token: string, chatId: number, text: string, replyMarkup: any, replyToMessageId?: number) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload: any = {
      chat_id: chatId,
      text: text,
      reply_markup: replyMarkup,
      parse_mode: 'HTML'
    };
    if (replyToMessageId) {
      payload.reply_to_message_id = replyToMessageId;
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error('Error sending message with keyboard:', err);
  }
}

// Helper to edit existing message text and reply markup (for seamless UI transitions)
async function editMessageWithKeyboard(token: string, chatId: number, messageId: number, text: string, replyMarkup: any) {
  try {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const payload: any = {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      reply_markup: replyMarkup,
      parse_mode: 'HTML'
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (err) {
    console.error('Error editing message with keyboard:', err);
  }
}

// Helper to answer callback query from button clicks to prevent loading spinners in client
async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  try {
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text
      }),
    });
  } catch (err) {
    console.error('Error answering callback query:', err);
  }
}

// Helper to render user menu message and its inline keyboard
function getMenuMessageAndKeyboard(userId: string | number) {
  const uSettings = getUserSettings(userId);
  const text = `🛠 <b>تنظیمات اختصاصی شما</b>

در این بخش می‌توانید مشخصات فایل‌های خروجی و تبلیغاتی مربوط به حساب کاربری خود را مدیریت کنید:

📌 <b>الگوی نام جدید فایل‌ها:</b>
<code>${uSettings.fileNamePattern}</code>

📌 <b>آیدی کانال تبلیغات (درون فایل):</b>
<code>${uSettings.adText}</code>

📌 <b>کپشن ارسالی زیر فایل‌ها:</b>
<code>${uSettings.captionText}</code>

💡 <i>برای تغییر هر مورد، روی دکمه مربوطه کلیک کنید و سپس پاسخ را برای ربات ارسال فرمایید. هر زمان فایلی بفرستید با همین تنظیمات سفارشی خواهد شد!</i>`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: "✏️ تغییر الگوی نام فایل", callback_data: "set_pattern" },
        { text: "✏️ تغییر آیدی تبلیغات", callback_data: "set_ad" }
      ],
      [
        { text: "✏️ تغییر کپشن فایل‌ها", callback_data: "set_caption" }
      ],
      [
        { text: "🔄 بازنشانی به پیش‌فرض", callback_data: "reset_to_default" },
        { text: "ℹ️ راهنمای کامل کلیدها", callback_data: "help" }
      ],
      [
        { text: "⬅️ بازگشت به منوی اصلی", callback_data: "show_welcome" }
      ]
    ]
  };

  return { text, keyboard };
}

// Main Telegram Update Handler
export async function handleTelegramUpdate(update: any) {
  const settings = getSettings();
  if (!settings.botEnabled || !settings.botToken) {
    return;
  }

  // --- HANDLE INLINE BUTTON CLICKS (Callback Queries) ---
  if (update.callback_query) {
    const callbackQuery = update.callback_query;
    const chatId = callbackQuery.message.chat.id;
    const messageId = callbackQuery.message.message_id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;
    const callbackQueryId = callbackQuery.id;

    if (data === 'show_menu') {
      await answerCallbackQuery(settings.botToken, callbackQueryId);
      const menu = getMenuMessageAndKeyboard(userId);
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, menu.text, menu.keyboard);
      return;
    }

    if (data === 'show_welcome') {
      await answerCallbackQuery(settings.botToken, callbackQueryId);
      const welcome = `سلام! خوش آمدید. 🚀

من ربات پیشرفته تغییر نام، آنلاک و واترمارک‌گذاری کانفیگ‌های VPN شما هستم.

کافیه فایل کانفیگ خودتون (مثل .npvt، .ovpn، .sks، .hc و ...) رو برای من بفرستید (یا فوروارد کنید) تا فوراً با تنظیمات اختصاصی شما آماده بشه!`;
      const kb = {
        inline_keyboard: [
          [
            { text: "⚙️ تنظیمات اختصاصی من", callback_data: "show_menu" },
            { text: "ℹ️ راهنمای استفاده", callback_data: "help" }
          ]
        ]
      };
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, welcome, kb);
      return;
    }

    if (data === 'set_pattern') {
      userStates[userId] = 'waiting_pattern';
      await answerCallbackQuery(settings.botToken, callbackQueryId);
      const text = `✏️ <b>تغییر الگوی نام فایل‌های خروجی</b>

لطفاً نام یا الگوی دلخواه خود را تایپ کرده و ارسال کنید.
مثال: <code>@MySuperChannel</code>

<i>تمام فایل‌های ارسالی شما به این نام تغییر خواهند کرد.</i>`;
      const cancelKb = {
        inline_keyboard: [
          [{ text: "❌ انصراف و بازگشت", callback_data: "show_menu" }]
        ]
      };
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, text, cancelKb);
      return;
    }

    if (data === 'set_ad') {
      userStates[userId] = 'waiting_ad';
      await answerCallbackQuery(settings.botToken, callbackQueryId);
      const text = `✏️ <b>تغییر آیدی کانال یا متن تبلیغاتی داخل فایل</b>

لطفاً آیدی کانال خود را تایپ کرده و ارسال کنید.
مثال: <code>@MyChannel</code>

<i>این آیدی در تبلیغات و قفل کانال کانفیگ‌های NPVT و همچنین سورس فایل‌های OVPN جاسازی می‌شود.</i>`;
      const cancelKb = {
        inline_keyboard: [
          [{ text: "❌ انصراف و بازگشت", callback_data: "show_menu" }]
        ]
      };
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, text, cancelKb);
      return;
    }

    if (data === 'set_caption') {
      userStates[userId] = 'waiting_caption';
      await answerCallbackQuery(settings.botToken, callbackQueryId);
      const text = `✏️ <b>تغییر کپشن پیام ارسالی</b>

لطفاً متن کپشن ارسالی دلخواه خود را بنویسید و ارسال کنید. می‌توانید از اموجی‌ها استفاده کنید.

<i>این کپشن زیر فایل ارسال شده در تلگرام قرار خواهد گرفت.</i>`;
      const cancelKb = {
        inline_keyboard: [
          [{ text: "❌ انصراف و بازگشت", callback_data: "show_menu" }]
        ]
      };
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, text, cancelKb);
      return;
    }

    if (data === 'reset_to_default') {
      updateUserSettings(userId, {
        fileNamePattern: settings.fileNamePattern,
        adText: settings.adText,
        captionText: settings.captionText
      });
      await answerCallbackQuery(settings.botToken, callbackQueryId, 'تنظیمات شما با موفقیت بازنشانی شد.');
      const menu = getMenuMessageAndKeyboard(userId);
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, menu.text, menu.keyboard);
      return;
    }

    if (data === 'help') {
      await answerCallbackQuery(settings.botToken, callbackQueryId);
      const helpText = `ℹ️ <b>راهنمای بخش‌های مختلف:</b>

1️⃣ <b>الگوی نام فایل:</b> نامی است که جایگزین نام فایل‌های ارسالی به ربات خواهد شد (مثلاً نام کانال شما).
2️⃣ <b>کانال تبلیغاتی (درون فایل):</b> جهت قفل‌شکنی یا جاسازی تبلیغات داخل ساختار خود کانفیگ به کار می‌رود.
3️⃣ <b>کپشن فایل:</b> متنی است که ربات به عنوان توضیحات در زیر فایل پردازش‌شده ارسال خواهد کرد.

🌟 <b>مزیت بزرگ:</b> تنظیمات شما کاملاً شخصی بوده و هیچ کاربری به تنظیمات کاربر دیگر دسترسی نخواهد داشت!`;
      const backKb = {
        inline_keyboard: [
          [{ text: "⬅️ بازگشت", callback_data: "show_menu" }]
        ]
      };
      await editMessageWithKeyboard(settings.botToken, chatId, messageId, helpText, backKb);
      return;
    }
  }

  // --- HANDLE STANDARD MESSAGE UPDATES ---
  const message = update.message || update.edited_message;
  if (!message) return;

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text || '';
  const replyToId = message.message_id;

  // Check state machine first
  const currentState = userStates[userId];
  if (currentState) {
    if (text === '/start' || text === '/cancel') {
      userStates[userId] = null;
    } else {
      let responseText = '';
      if (currentState === 'waiting_pattern') {
        updateUserSettings(userId, { fileNamePattern: text.trim() });
        responseText = `✅ الگوی نام فایل با موفقیت به <code>${text.trim()}</code> تغییر یافت.`;
      } else if (currentState === 'waiting_ad') {
        updateUserSettings(userId, { adText: text.trim() });
        responseText = `✅ آیدی تبلیغات داخل فایل با موفقیت به <code>${text.trim()}</code> تغییر یافت.`;
      } else if (currentState === 'waiting_caption') {
        updateUserSettings(userId, { captionText: text });
        responseText = `✅ کپشن ارسالی با موفقیت بروزرسانی شد.`;
      }

      userStates[userId] = null; // Reset state
      await sendTextMessage(settings.botToken, chatId, responseText, replyToId);
      const menu = getMenuMessageAndKeyboard(userId);
      await sendMessageWithKeyboard(settings.botToken, chatId, menu.text, menu.keyboard);
      return;
    }
  }

  // 1. Process standard commands
  if (text.startsWith('/start')) {
    userStates[userId] = null;
    const welcome = `سلام! خوش آمدید. 🚀

من ربات پیشرفته تغییر نام، آنلاک و واترمارک‌گذاری کانفیگ‌های VPN شما هستم.

کافیه فایل کانفیگ خودتون (مثل .npvt، .ovpn، .sks، .hc و ...) رو برای من بفرستید (یا فوروارد کنید) تا فوراً با تنظیمات اختصاصی شما آماده بشه!`;
    const kb = {
      inline_keyboard: [
        [
          { text: "⚙️ تنظیمات اختصاصی من", callback_data: "show_menu" },
          { text: "ℹ️ راهنمای استفاده", callback_data: "help" }
        ]
      ]
    };
    await sendMessageWithKeyboard(settings.botToken, chatId, welcome, kb, replyToId);
    return;
  }

  // 2. Process forwarded or uploaded documents/files using user-specific settings
  if (message.document) {
    const doc = message.document;
    const fileId = doc.file_id;
    const originalName = doc.file_name || 'config';
    const fileSize = doc.file_size || 0;

    // Limit to 20MB
    if (fileSize > 20 * 1024 * 1024) {
      await sendTextMessage(settings.botToken, chatId, '❌ حجم فایل بیش از حد مجاز (20 مگابایت) است.', replyToId);
      return;
    }

    // Retrieve per-user custom settings
    const uSettings = getUserSettings(userId);

    try {
      // Get File path from Telegram
      const getFileUrl = `https://api.telegram.org/bot${settings.botToken}/getFile?file_id=${fileId}`;
      const fileRes = await fetch(getFileUrl);
      const fileData = await fileRes.json();

      if (!fileData.ok || !fileData.result.file_path) {
        throw new Error('Failed to get file path from Telegram');
      }

      const filePath = fileData.result.file_path;
      const downloadUrl = `https://api.telegram.org/file/bot${settings.botToken}/${filePath}`;
      
      // Download content
      const downloadRes = await fetch(downloadUrl);
      const fileBuffer = await downloadRes.arrayBuffer();
      const contentText = Buffer.from(fileBuffer).toString('utf8');

      // Process file using user settings
      const result = customizeConfig(
        contentText,
        originalName,
        uSettings.fileNamePattern,
        uSettings.adText
      );

      // Construct new file name: user pattern + original extension
      let ext = originalName.includes('.') ? originalName.split('.').pop() : '';
      let newFilename = uSettings.fileNamePattern;
      if (ext) {
        newFilename = `${uSettings.fileNamePattern}.${ext}`;
      }

      // Convert customized content back to Blob
      const processedBlob = new Blob([result.content], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      formData.append('document', processedBlob, newFilename);
      formData.append('caption', uSettings.captionText);
      formData.append('reply_to_message_id', replyToId.toString());

      // Send document back
      const sendRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      const sendResult = await sendRes.json();
      if (!sendResult.ok) {
        throw new Error(sendResult.description || 'Failed to send document back');
      }

      // Add to Log database including user identity
      addLog({
        originalName: originalName,
        newName: newFilename,
        fileSize: fileSize,
        fileType: result.fileType,
        status: result.modified ? 'unlocked' : 'success',
        message: `Processed under user custom settings (${result.fileType})`,
        userId: String(userId),
        userUsername: message.from.username || 'unknown'
      });

    } catch (err: any) {
      console.error('Error processing document:', err);
      await sendTextMessage(settings.botToken, chatId, `❌ خطا در پردازش فایل: ${err.message || 'خطای نامشخص'}`, replyToId);
      
      addLog({
        originalName: originalName,
        newName: originalName,
        fileSize: fileSize,
        fileType: originalName.split('.').pop()?.toUpperCase() || 'Unknown',
        status: 'failed',
        message: err.message || 'Unknown processing error',
        userId: String(userId),
        userUsername: message.from.username || 'unknown'
      });
    }
    return;
  }

  // 3. Process direct text VPN configs (vmess, vless, trojan, etc.) using user-specific settings
  if (text.includes('vmess://') || text.includes('vless://') || text.includes('trojan://') || text.includes('ss://')) {
    const uSettings = getUserSettings(userId);
    try {
      const result = customizeConfig(
        text,
        'config.txt',
        uSettings.fileNamePattern,
        uSettings.adText
      );

      const newFilename = `${uSettings.fileNamePattern}.txt`;
      const processedBlob = new Blob([result.content], { type: 'application/octet-stream' });
      const formData = new FormData();
      formData.append('chat_id', chatId.toString());
      formData.append('document', processedBlob, newFilename);
      formData.append('caption', uSettings.captionText);
      formData.append('reply_to_message_id', replyToId.toString());

      const sendRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/sendDocument`, {
        method: 'POST',
        body: formData,
      });

      const sendResult = await sendRes.json();
      if (!sendResult.ok) {
        throw new Error(sendResult.description || 'Failed to send text-config file');
      }

      addLog({
        originalName: 'Text Links',
        newName: newFilename,
        fileSize: text.length,
        fileType: 'V2ray Link List',
        status: 'unlocked',
        message: 'Processed V2ray links text under user custom settings',
        userId: String(userId),
        userUsername: message.from.username || 'unknown'
      });
    } catch (err: any) {
      console.error('Error processing text link config:', err);
      await sendTextMessage(settings.botToken, chatId, `❌ خطا در پردازش متن کانفیگ: ${err.message}`, replyToId);
    }
  }
}

// Long Polling function
async function runLongPolling(token: string) {
  if (pollingActive) return;
  pollingActive = true;
  console.log('Telegram Bot: Long Polling started.');

  while (pollingActive) {
    const settings = getSettings();
    if (!settings.botEnabled || settings.botToken !== token) {
      console.log('Telegram Bot: Stopping polling loop due to config changes.');
      pollingActive = false;
      break;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId}&timeout=20`);
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const data = await response.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = update.update_id + 1;
          await handleTelegramUpdate(update);
        }
      }
    } catch (err) {
      console.error('Telegram Bot Polling Error:', err);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// Start Bot Engine
export async function startBotEngine() {
  const settings = getSettings();
  if (!settings.botEnabled || !settings.botToken) {
    updateBotStatus({ isRunning: false, username: '', name: '', error: 'Token missing or bot disabled' });
    return;
  }

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/getMe`);
    const meData = await meRes.json();

    if (!meData.ok) {
      throw new Error(meData.description || 'Invalid token');
    }

    const botUser = meData.result;
    console.log(`Telegram Bot authenticated: @${botUser.username}`);

    const appUrl = process.env.APP_URL;
    let webhookRegistered = false;

    if (appUrl && appUrl.startsWith('https')) {
      const webhookUrl = `${appUrl}/api/telegram-webhook`;
      console.log(`Telegram Bot: Registering webhook to ${webhookUrl}`);
      
      const setWebhookRes = await fetch(`https://api.telegram.org/bot${settings.botToken}/setWebhook?url=${webhookUrl}`);
      const setWebhookData = await setWebhookRes.json();
      
      if (setWebhookData.ok) {
        webhookRegistered = true;
        console.log('Telegram Bot: Webhook registered successfully!');
        updateBotStatus({
          isRunning: true,
          username: botUser.username,
          name: botUser.first_name,
          webhookUrl: webhookUrl,
          error: undefined
        });
      } else {
        console.warn('Telegram Bot: Webhook registration failed:', setWebhookData.description);
      }
    }

    if (!webhookRegistered) {
      await fetch(`https://api.telegram.org/bot${settings.botToken}/deleteWebhook`);
      
      pollingActive = false;
      await new Promise(resolve => setTimeout(resolve, 1000));

      runLongPolling(settings.botToken);

      updateBotStatus({
        isRunning: true,
        username: botUser.username,
        name: botUser.first_name,
        webhookUrl: 'Polling Mode (Active)',
        error: undefined
      });
    }

  } catch (err: any) {
    console.error('Error starting bot engine:', err);
    updateBotStatus({
      isRunning: false,
      username: '',
      name: '',
      error: err.message || 'Authentication failed'
    });
  }
}

// Stop Bot Engine
export async function stopBotEngine() {
  pollingActive = false;
  const settings = getSettings();
  if (settings.botToken) {
    try {
      await fetch(`https://api.telegram.org/bot${settings.botToken}/deleteWebhook`);
    } catch (err) {
      console.error('Error deleting webhook during bot stop:', err);
    }
  }
  updateBotStatus({
    isRunning: false,
    username: '',
    name: '',
    webhookUrl: '',
    error: undefined
  });
}
