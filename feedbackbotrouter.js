const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const firebase = require("./db");
const fireStore = firebase.firestore();

const COLLECTION_SESSIONS = "feedback_sessions";
const COLLECTION_SUBMISSIONS = "feedback_submissions";

const STEP_SOLUTION = 1;
const STEP_TYPE = 2;
const STEP_SCREENSHOT = 3;
const STEP_DESCRIPTION = 4;
const STEP_STORE = 5;
const STEP_VERSION = 6;

const SOLUTION_MAP = {
  s_A: "POS",
  s_B: "Foodio Hub",
  s_C: "Kaotim",
  s_D: "Report+",
  s_E: "FoodioToGo",
};

const TYPE_MAP = {
  t_bug: "bug",
  t_feature: "feature",
};

class FeedbackBotRouter {
  constructor() {
    this.router = express.Router();
    this.token = process.env.TELEGRAM_FEEDBACK_BOT_TOKEN;
    this.bot = this.token
      ? new TelegramBot(this.token, { polling: false })
      : null;
    this.initializeRoutes();
  }

  initializeRoutes() {
    this.router.get("/about", this.about.bind(this));
    this.router.get("/setwebhook", this.setWebhook.bind(this));
    this.router.post("/webhook", this.webhook.bind(this));
  }

  about(req, res) {
    res.json({ version: "1.0.0", service: "Telegram Feedback Bot" });
  }

  /**
   * Register Telegram webhook. Example:
   * GET /feedbackbot/setwebhook?url=https://YOUR_HOST/feedbackbot/webhook
   */
  async setWebhook(req, res) {
    if (!this.token) {
      return res.status(503).json({
        success: false,
        message: "TELEGRAM_FEEDBACK_BOT_TOKEN is not set",
      });
    }
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({
        success: false,
        message:
          'Missing query param "url". Example: ?url=https://your-host/feedbackbot/webhook',
      });
    }
    try {
      const api = `https://api.telegram.org/bot${this.token}/setWebhook`;
      const response = await axios.get(api, { params: { url } });
      const data = response.data;
      return res.status(200).json({ success: data.ok === true, result: data });
    } catch (err) {
      console.error("setWebhook error:", err.response?.data || err.message);
      return res.status(500).json({
        success: false,
        message: err.response?.data?.description || err.message,
      });
    }
  }

  async webhook(req, res) {
    if (!this.bot || !this.token) {
      return res.status(503).json({
        success: false,
        message: "Bot not configured (missing TELEGRAM_FEEDBACK_BOT_TOKEN)",
      });
    }

    try {
      await this.handleUpdate(req.body);
    } catch (err) {
      console.error("feedbackbot webhook:", err);
    }
    return res.sendStatus(200);
  }

  keyboardWelcome() {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✨ Begin submission", callback_data: "fb_begin" }],
        ],
      },
    };
  }

  keyboardSolution() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "A — POS", callback_data: "s_A" },
            { text: "B — Foodio Hub", callback_data: "s_B" },
          ],
          [
            { text: "C — Kaotim", callback_data: "s_C" },
            { text: "D — Report+", callback_data: "s_D" },
          ],
          [{ text: "E — FoodioToGo", callback_data: "s_E" }],
        ],
      },
    };
  }

  keyboardType() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "1 — Bug", callback_data: "t_bug" },
            { text: "2 — Feature", callback_data: "t_feature" },
          ],
        ],
      },
    };
  }

  /**
   * First-time / welcome UX (Telegram only sends updates after the user acts):
   * - User taps "Start" in the client → Telegram sends /start → the bot replies with this message.
   * - Same for /start@YourBot — or /start with a deep-link payload after a space from t.me links.
   * - Any other first message without a session → show this welcome too so users are not stuck.
   */
  getWelcomeText() {
    return (
      "👋 <b>Welcome — report a bug or suggest a feature</b>\n\n" +
      "I will guide you step by step; it usually takes about a minute. Here’s what I will ask:\n\n" +
      "1️⃣ Which product — POS, Foodio Hub, Kaotim, Report+, or FoodioToGo\n" +
      "2️⃣ Bug or feature request\n" +
      "3️⃣ Screenshot — optional\n" +
      "4️⃣ Short description of the issue or idea\n" +
      "5️⃣ Store ID or store name\n" +
      "6️⃣ App / software version — optional\n\n" +
      "<b>Tap the button below when you’re ready.</b> You don’t need to type /start."
    );
  }

  async sendWelcome(chatId) {
    await this.bot.sendMessage(chatId, this.getWelcomeText(), {
      parse_mode: "HTML",
      ...this.keyboardWelcome(),
    });
  }

  async sendStep1(chatId) {
    await this.bot.sendMessage(
      chatId,
      "Step 1: Which solution is this about?\n\n" +
        "A — POS\nB — Foodio Hub\nC — Kaotim\nD — Report+\nE — FoodioToGo\n\nTap a button below:",
      this.keyboardSolution()
    );
  }

  async getSession(chatId) {
    const doc = await fireStore
      .collection(COLLECTION_SESSIONS)
      .doc(String(chatId))
      .get();
    if (!doc.exists) return null;
    return doc.data();
  }

  async setSession(chatId, patch) {
    await fireStore
      .collection(COLLECTION_SESSIONS)
      .doc(String(chatId))
      .set(patch, { merge: true });
  }

  async clearSession(chatId) {
    await fireStore
      .collection(COLLECTION_SESSIONS)
      .doc(String(chatId))
      .delete();
  }

  async ensureSessionDoc(chatId, from) {
    const username =
      from && (from.username || [from.first_name, from.last_name].filter(Boolean).join(" "));
    await this.setSession(chatId, {
      step: STEP_SOLUTION,
      data: {},
      username: username || null,
      updatedAt: new Date().toISOString(),
    });
  }

  async handleUpdate(body) {
    if (!body) return;

    if (body.callback_query) {
      return this.handleCallbackQuery(body.callback_query);
    }

    if (body.message) {
      return this.handleMessage(body.message);
    }
  }

  async handleCallbackQuery(q) {
    const chatId = q.message && q.message.chat && q.message.chat.id;
    const messageId = q.message && q.message.message_id;
    const data = q.data;
    if (!chatId || !data) {
      await this.safeAnswerCb(q.id);
      return;
    }

    const session = await this.getSession(chatId);

    try {
      if (data === "fb_begin") {
        await this.safeAnswerCb(q.id, { text: "Starting…" });
        await this.ensureSessionDoc(chatId, q.from);
        await this.sendStep1(chatId);
        if (messageId) {
          await this.bot
            .editMessageReplyMarkup(
              { inline_keyboard: [] },
              { chat_id: chatId, message_id: messageId }
            )
            .catch(() => {});
        }
        return;
      }

      if (data.startsWith("s_") && SOLUTION_MAP[data]) {
        const step = session ? session.step : null;
        if (!session || step !== STEP_SOLUTION) {
          await this.safeAnswerCb(q.id, { text: "Open the menu and tap /start." });
          return;
        }

        await this.setSession(chatId, {
          step: STEP_TYPE,
          data: {
            ...(session.data || {}),
            solution: SOLUTION_MAP[data],
          },
          updatedAt: new Date().toISOString(),
        });

        await this.bot.editMessageText(
          `Step 2: Bug or Feature?\n\nYou selected: ${SOLUTION_MAP[data]}`,
          {
            chat_id: chatId,
            message_id: messageId,
          }
        );
        await this.bot.sendMessage(
          chatId,
          "Tap a button:",
          this.keyboardType()
        );
        await this.safeAnswerCb(q.id);
        return;
      }

      if (data.startsWith("t_") && TYPE_MAP[data]) {
        const step = session ? session.step : null;
        if (!session || step !== STEP_TYPE) {
          await this.safeAnswerCb(q.id, { text: "Open the menu and tap /start." });
          return;
        }

        await this.setSession(chatId, {
          step: STEP_SCREENSHOT,
          data: {
            ...(session.data || {}),
            feedbackType: TYPE_MAP[data],
          },
          updatedAt: new Date().toISOString(),
        });

        await this.bot.editMessageText(
          `Step 3: Send a screenshot\n\nSelected: ${TYPE_MAP[data] === "bug" ? "Bug" : "Feature"}`,
          {
            chat_id: chatId,
            message_id: messageId,
          }
        );
        await this.bot.sendMessage(
          chatId,
          "Send a photo, or reply with *skip* if you don't have one.",
          { parse_mode: "Markdown" }
        );
        await this.safeAnswerCb(q.id);
        return;
      }
    } catch (err) {
      console.error("callback_query handler:", err);
      await this.safeAnswerCb(q.id, {
        text: "Something went wrong. Tap /start in the menu.",
      });
    }

    await this.safeAnswerCb(q.id);
  }

  safeAnswerCb(id, opts) {
    return this.bot
      .answerCallbackQuery(id, opts || {})
      .catch(() => {});
  }

  async handleMessage(msg) {
    const chatId = msg.chat && msg.chat.id;
    const from = msg.from;
    if (!chatId) return;

    const text = msg.text ? msg.text.trim() : "";
    /** Matches /start including deep-link payloads: /start ref — not /startup */
    const looksLikeStartCommand = /^\/start\b/.test(text);

    if (looksLikeStartCommand) {
      try {
        await this.clearSession(chatId);
      } catch (_) {
        /* noop */
      }
      await this.sendWelcome(chatId);
      return;
    }

    let session = await this.getSession(chatId);
    if (!session) {
      await this.sendWelcome(chatId);
      return;
    }

    const step = session.step;

    try {
      if (step === STEP_SCREENSHOT) {
        const photos = msg.photo;
        let fileId = null;
        if (photos && photos.length) {
          const largest = photos[photos.length - 1];
          fileId = largest.file_id;
        } else if (text && text.toLowerCase() === "skip") {
          fileId = null;
        } else {
          await this.bot.sendMessage(
            chatId,
            "Send a photo, or reply *skip*.",
            { parse_mode: "Markdown" }
          );
          return;
        }

        await this.setSession(chatId, {
          step: STEP_DESCRIPTION,
          data: {
            ...(session.data || {}),
            screenshotFileId: fileId || null,
          },
          updatedAt: new Date().toISOString(),
        });

        await this.bot.sendMessage(
          chatId,
          "Step 4: Describe the bug or feature in detail:"
        );
        return;
      }

      if (!text) {
        await this.bot.sendMessage(
          chatId,
          "Please send text, or send a screenshot in step 3."
        );
        return;
      }

      if (step === STEP_DESCRIPTION) {
        await this.setSession(chatId, {
          step: STEP_STORE,
          data: {
            ...(session.data || {}),
            description: text,
          },
          updatedAt: new Date().toISOString(),
        });
        await this.bot.sendMessage(
          chatId,
          "Step 5: Enter your Store ID or Store title:"
        );
        return;
      }

      if (step === STEP_STORE) {
        await this.setSession(chatId, {
          step: STEP_VERSION,
          data: {
            ...(session.data || {}),
            storeInfo: text,
          },
          updatedAt: new Date().toISOString(),
        });
        await this.bot.sendMessage(
          chatId,
          "Step 6 (last): Enter app/software version if any, or reply *skip*.",
          { parse_mode: "Markdown" }
        );
        return;
      }

      if (step === STEP_VERSION) {
        const version =
          text.toLowerCase() === "skip" ? null : text;
        const finalData = {
          ...(session.data || {}),
          version,
        };

        await fireStore.collection(COLLECTION_SUBMISSIONS).add({
          ...finalData,
          chatId,
          username: session.username || (from && from.username) || null,
          telegramUserId: from && from.id,
          createdAt: new Date().toISOString(),
        });

        await this.clearSession(chatId);

        await this.bot.sendMessage(
          chatId,
          "Thank you! Your submission has been received.\n\n" +
            this.formatSummary(finalData) +
            "\n\nSend /start from the menu, or tap ✨ Begin submission again anytime to submit another."
        );
        return;
      }

      if (step === STEP_SOLUTION || step === STEP_TYPE) {
        await this.bot.sendMessage(
          chatId,
          "Please use the inline buttons above, or tap /start in the menu to begin again."
        );
        return;
      }
    } catch (err) {
      console.error("handleMessage:", err);
      await this.bot.sendMessage(
        chatId,
        "Something went wrong. Tap /start in the menu to try again."
      );
    }
  }

  formatSummary(data) {
    const lines = [
      `Solution: ${data.solution || "—"}`,
      `Type: ${data.feedbackType || "—"}`,
      `Screenshot: ${data.screenshotFileId ? "(attached to Telegram)" : "none"}`,
      `Description: ${data.description || "—"}`,
      `Store: ${data.storeInfo || "—"}`,
      `Version: ${data.version != null ? data.version : "—"}`,
    ];
    return lines.join("\n");
  }

  getRouter() {
    return this.router;
  }
}

module.exports = FeedbackBotRouter;
