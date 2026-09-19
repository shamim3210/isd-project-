const express = require("express");
const router = express.Router();
const Book = require("../models/Book");
const Transaction = require("../models/Transaction");
const { asyncHandler } = require("../middleware/errorHandler");

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
let anthropic = null;
if (ANTHROPIC_KEY) {
  try {
    const Anthropic = require("@anthropic-ai/sdk");
    anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });
    console.log("🤖 Chatbot: AI mode (Anthropic key found)");
  } catch (err) {
    // If the SDK isn't installed (e.g. .env was edited after `npm install`
    // already ran), never let that crash the whole server — just disable
    // AI mode and keep the FAQ fallback working.
    console.error("⚠️  Chatbot: ANTHROPIC_API_KEY is set but @anthropic-ai/sdk failed to load. Run `npm install` in /backend. Falling back to FAQ mode:", err.message);
  }
} else {
  console.log("🤖 Chatbot: FAQ fallback mode (no ANTHROPIC_API_KEY set)");
}

const SYSTEM_PROMPT = `You are the LibraryMS assistant for Southeast University's online library.
You help students and librarians with: searching the catalog, understanding how to borrow/return/reserve
books, fines (৳5/day late fee, 14-day loan period), account questions (verification, password reset, 2FA),
and general library policy questions based on what you know about this system.

You have a "search_books" tool — use it whenever the person asks about a specific book, author, or topic,
so you can give real, accurate answers from the actual catalog instead of guessing.

Keep answers short (2-4 sentences), friendly, and specific. If you don't know something about this
particular library's policies beyond what's described here, say so rather than inventing details.`;

const SEARCH_BOOKS_TOOL = {
  name: "search_books",
  description: "Search the LibraryMS catalog by title, author, or keyword. Returns matching books with availability.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search term — a title, author name, or topic" },
    },
    required: ["query"],
  },
};

async function runSearchBooksTool(query) {
  const books = await Book.find({ $text: { $search: query } })
    .limit(5)
    .select("title author category availableCopies totalCopies shelfLocation");
  if (!books.length) return { found: false, message: "No matching books found in the catalog." };
  return {
    found: true,
    results: books.map((b) => ({
      title: b.title,
      author: b.author,
      category: b.category,
      available: b.availableCopies > 0,
      copies: `${b.availableCopies}/${b.totalCopies}`,
      shelf: b.shelfLocation,
    })),
  };
}

// Simple rule-based fallback for when no API key is configured, so the
// chatbot still says something useful instead of failing outright.
const FALLBACK_FAQ = [
  { keywords: ["borrow"], answer: "Find a book in Browse, open it, and tap \"Borrow this book\". You'll need to be logged in. Books are due back in 14 days." },
  { keywords: ["return"], answer: "Go to My Loans and tap \"Return\" next to the book. Late returns get a ৳5/day fine." },
  { keywords: ["renew"], answer: "Open My Loans and tap \"Renew\" next to a borrowed book — you can renew once as long as nobody else has reserved it." },
  { keywords: ["fine", "fee"], answer: "Fines are ৳5 per day for late returns. Check My Loans to see if you owe anything." },
  { keywords: ["reserve", "hold"], answer: "If a book is checked out, open its detail page and tap \"Reserve this book\" — you'll get an email when it's returned." },
  { keywords: ["password", "reset", "forgot"], answer: "On the login screen, tap \"Forgot password?\" and check your email for a reset link." },
  { keywords: ["2fa", "two factor", "authenticator"], answer: "You can turn on 2FA from account settings (the gear icon next to your name) for extra login security." },
  { keywords: ["room", "study room", "seat"], answer: "Go to the Rooms tab to see available study rooms and book a time slot." },
  { keywords: ["suggest", "request a book", "recommend a book"], answer: "Use \"Suggest a book\" (in My Loans) to ask the librarian to add a title that's missing from the catalog." },
  { keywords: ["hour", "open", "time"], answer: "LibraryMS is available online 24/7. For the physical library's opening hours, check with the front desk." },
  { keywords: ["verify", "verification"], answer: "Check your inbox for a verification email after registering. No email? Use the \"Resend verification email\" banner." },
];
function fallbackReply(message) {
  const lower = message.toLowerCase();
  const hit = FALLBACK_FAQ.find((f) => f.keywords.some((k) => lower.includes(k)));
  return hit ? hit.answer : "I'm running in basic mode right now (no AI key configured) and can only answer simple questions about borrowing, returns, renewing, fines, reservations, rooms, and passwords. Try rephrasing, or ask one of those topics directly.";
}

// POST /api/chatbot  { message, history: [{role, content}] }
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { message, history = [] } = req.body;
    if (!message || !message.trim()) return res.status(400).json({ error: "Message is required." });
    if (message.length > 1000) return res.status(400).json({ error: "Message is too long." });

    if (!anthropic) {
      return res.json({ reply: fallbackReply(message), mode: "fallback" });
    }

    // Cap history so a long conversation never balloons token cost or hits limits.
    const trimmedHistory = history.slice(-12);
    const messages = [...trimmedHistory, { role: "user", content: message }];

    try {
      let response = await callClaudeWithTimeout(messages);

      // Handle up to 3 rounds of tool use — enough for a real lookup, capped
      // so a stuck tool loop can never hang the request indefinitely.
      let rounds = 0;
      while (response.stop_reason === "tool_use" && rounds < 3) {
        rounds++;
        const toolUse = response.content.find((b) => b.type === "tool_use");
        if (!toolUse) break;

        let toolResult;
        try {
          toolResult = await runSearchBooksTool(toolUse.input.query);
        } catch (err) {
          toolResult = { found: false, message: "Search is temporarily unavailable." };
        }

        messages.push({ role: "assistant", content: response.content });
        messages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }],
        });

        response = await callClaudeWithTimeout(messages);
      }

      const textBlock = response.content.find((b) => b.type === "text");
      res.json({
        reply: textBlock?.text || "Sorry, I couldn't come up with an answer to that.",
        mode: "llm",
        updatedHistory: [...messages, { role: "assistant", content: response.content }].slice(-12),
      });
    } catch (err) {
      // Anthropic API down, rate-limited, key invalid, or timed out — never
      // let that break the chat experience. Fall back gracefully instead.
      console.error("Chatbot LLM call failed, falling back:", err.message);
      res.json({ reply: fallbackReply(message), mode: "fallback_after_error" });
    }
  })
);

function callClaudeWithTimeout(messages, timeoutMs = 15000) {
  return Promise.race([
    anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [SEARCH_BOOKS_TOOL],
      messages,
    }),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Anthropic API timed out")), timeoutMs)),
  ]);
}

module.exports = router;
