import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
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
const MODEL_DEPLOYMENT_NAME = process.env.MODEL_DEPLOYMENT_NAME || "gpt-4o";

if (!FOUNDRY_PROJECT_ENDPOINT) {
  console.error("ERROR: FOUNDRY_PROJECT_ENDPOINT environment variable is required.");
  console.error("Copy .env.sample to .env and fill in your Azure AI Foundry project endpoint.");
  process.exit(1);
}

const credential = new DefaultAzureCredential();
const project = new AIProjectClient(FOUNDRY_PROJECT_ENDPOINT, credential);
const openAIClient = project.getOpenAIClient();

const AGENT_NAME = "contoso-hotel-agent";

const AGENT_INSTRUCTIONS = `You are the Contoso Stays virtual concierge — a friendly, professional hotel assistant.

Your responsibilities:
- Answer questions about Contoso Stays hotel policies, services, and amenities
- Help guests with reservation inquiries, check-in/check-out times, cancellation policies, pricing, and loyalty program details
- Provide information about pet policies, smoking policies, accessibility, and damages/liability
- Offer warm, helpful, and concise responses befitting a luxury hotel brand

Guidelines:
- Always be polite, welcoming, and professional
- If you don't know something specific, suggest the guest contact support@contosostays.com or call 1-800-555-STAY
- Keep answers concise but thorough
- Use the file search tool to look up policy details when answering questions
- Format responses clearly; use bullet points for lists when appropriate

Key facts:
- Brand name: Contoso Stays
- Support email: support@contosostays.com
- Phone: 1-800-555-STAY
- Check-in: 3:00 PM | Check-out: 11:00 AM
- Loyalty program: Contoso Rewards (Silver, Gold, Platinum tiers)`;

let agentReady = false;
let agentName = AGENT_NAME;
let vectorStoreId = null;

async function initializeAgent() {
  try {
    console.log("Initializing Contoso Hotel agent...");

    // Upload POLICY.md to a vector store for file search
    const policyPath = path.join(__dirname, "..", "POLICY.md");
    if (fs.existsSync(policyPath)) {
      console.log("Creating vector store for hotel policies...");
      const vectorStore = await openAIClient.vectorStores.create({
        name: "ContosoPolicies",
      });
      vectorStoreId = vectorStore.id;
      console.log(`Vector store created (id: ${vectorStoreId})`);

      const fileStream = fs.createReadStream(policyPath);
      const uploadedFile = await openAIClient.vectorStores.files.uploadAndPoll(
        vectorStoreId,
        fileStream
      );
      console.log(`Policy file uploaded (id: ${uploadedFile.id})`);
    }

    // Create the agent with file_search tool
    const toolsConfig = vectorStoreId
      ? [{ type: "file_search", vector_store_ids: [vectorStoreId] }]
      : [];

    const agent = await project.agents.createVersion(AGENT_NAME, {
      kind: "prompt",
      model: MODEL_DEPLOYMENT_NAME,
      instructions: AGENT_INSTRUCTIONS,
      tools: toolsConfig,
    });

    agentName = agent.name;
    agentReady = true;
    console.log(`Agent ready (name: ${agentName}, version: ${agent.version})`);
  } catch (err) {
    console.error("Failed to initialize agent:", err.message);
    console.error("The server will still start — chat endpoints will return errors until the agent is configured.");
  }
}

// Store active conversations: { conversationId -> true }
const activeConversations = new Map();

// POST /api/chat/start — Create a new conversation
app.post("/api/chat/start", async (_req, res) => {
  if (!agentReady) {
    return res.status(503).json({ error: "Agent is not ready yet. Please try again shortly." });
  }

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
  if (!agentReady) {
    return res.status(503).json({ error: "Agent is not ready yet. Please try again shortly." });
  }

  const { conversationId, message } = req.body;

  if (!conversationId || !message) {
    return res.status(400).json({ error: "conversationId and message are required." });
  }

  if (!activeConversations.has(conversationId)) {
    return res.status(404).json({ error: "Conversation not found. Start a new chat." });
  }

  try {
    // Add the user message to the conversation
    await openAIClient.conversations.items.create(conversationId, {
      items: [{ type: "message", role: "user", content: message }],
    });

    // Generate the agent's response
    const response = await openAIClient.responses.create(
      { conversation: conversationId },
      { body: { agent: { name: agentName, type: "agent_reference" } } }
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
  res.json({ status: agentReady ? "ready" : "initializing" });
});

app.listen(PORT, async () => {
  console.log(`Contoso Hotel Chat server running at http://localhost:${PORT}`);
  await initializeAgent();
});
