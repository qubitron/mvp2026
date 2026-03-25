import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { AIProjectClient } from "@azure/ai-projects";
import { DefaultAzureCredential } from "@azure/identity";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const FOUNDRY_PROJECT_ENDPOINT = process.env.FOUNDRY_PROJECT_ENDPOINT;
const AGENT_NAME = process.env.AGENT_NAME;

if (!FOUNDRY_PROJECT_ENDPOINT) {
  console.error("ERROR: FOUNDRY_PROJECT_ENDPOINT environment variable is required.");
  console.error("Copy .env.sample to .env and fill in your Azure AI Foundry project endpoint.");
  process.exit(1);
}

if (!AGENT_NAME) {
  console.error("ERROR: AGENT_NAME environment variable is required.");
  console.error("Set AGENT_NAME to the name of an existing agent in your Foundry project.");
  process.exit(1);
}

const credential = new DefaultAzureCredential();
const project = new AIProjectClient(FOUNDRY_PROJECT_ENDPOINT, credential);
const openAIClient = project.getOpenAIClient();

console.log(`Ready — using agent "${AGENT_NAME}" (latest version)`);

// Store active conversations: { conversationId -> true }
const activeConversations = new Map();

// POST /api/chat/start — Create a new conversation
app.post("/api/chat/start", async (_req, res) => {
  try {
    const conversation = await openAIClient.conversations.create();
    activeConversations.set(conversation.id, true);
    res.json({ conversationId: conversation.id });
  } catch (err) {
    console.error("Error creating conversation:", err.message);
    res.status(500).json({ error: "Failed to start conversation." });
  }
});

// POST /api/chat/message — Send a message and get the agent's response
app.post("/api/chat/message", async (req, res) => {
  const { conversationId, message } = req.body;

  if (!conversationId || !message) {
    return res.status(400).json({ error: "conversationId and message are required." });
  }

  if (!activeConversations.has(conversationId)) {
    return res.status(404).json({ error: "Conversation not found. Start a new chat." });
  }

  try {
    // Send the user message and get the agent's response
    const response = await openAIClient.responses.create(
      {
        conversation: conversationId,
        input: message,
      },
      {
        body: { agent: { name: AGENT_NAME, type: "agent_reference" } },
      },
    );

    const reply = response.output_text || "I'm sorry, I couldn't generate a response. Please try again.";

    res.json({ reply });
  } catch (err) {
    console.error("Error processing message:", err.message);
    res.status(500).json({ error: "Failed to process your message. Please try again." });
  }
});

// POST /api/chat/end — End a conversation
app.post("/api/chat/end", async (req, res) => {
  const { conversationId } = req.body;

  if (conversationId && activeConversations.has(conversationId)) {
    try {
      await openAIClient.conversations.delete(conversationId);
    } catch {
      // Best-effort cleanup
    }
    activeConversations.delete(conversationId);
  }

  res.json({ ok: true });
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ready" });
});

app.listen(PORT, () => {
  console.log(`Contoso Hotel Chat server running at http://localhost:${PORT}`);
});
