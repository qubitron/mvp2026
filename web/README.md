# Contoso Stays — Virtual Concierge Chat

A hotel chat agent web app powered by **Azure AI Foundry Agent Service** using the `@azure/ai-projects` JavaScript SDK.

The agent answers guest questions about Contoso Stays policies, reservations, check-in/out, cancellation, loyalty program, pet policy, and more — using the hotel's policy document via file search.

![Architecture: Browser → Express API → Azure AI Foundry Agent Service]

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- An **Azure subscription** with an [Azure AI Foundry project](https://learn.microsoft.com/azure/ai-studio/how-to/create-projects)
- A **model deployment** in your Foundry project (e.g. `gpt-4o`)
- **Azure CLI** installed and logged in (`az login`)

## Quick Start

```bash
# 1. Navigate to the web app folder
cd web

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.sample .env
# Edit .env with your Foundry project endpoint and model deployment name

# 4. Start the server
npm start
```

Then open **http://localhost:3000** in your browser.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `FOUNDRY_PROJECT_ENDPOINT` | Your Azure AI Foundry project endpoint | `https://myaccount.services.ai.azure.com/api/projects/myproject` |
| `MODEL_DEPLOYMENT_NAME` | Deployed model name | `gpt-4o` |
| `PORT` | Server port (optional) | `3000` |

## Project Structure

```
web/
├── server.js          # Express backend — agent creation, chat API
├── package.json       # Dependencies
├── .env.sample        # Environment variable template
├── public/
│   ├── index.html     # Chat UI
│   ├── styles.css     # Hotel-themed styling
│   └── app.js         # Frontend chat logic
../POLICY.md           # Hotel policy document (uploaded to agent's vector store)
```

## How It Works

1. **Server startup**: Creates a vector store, uploads `POLICY.md`, and registers a Contoso Hotel agent with `file_search` tool
2. **New chat**: Frontend calls `POST /api/chat/start` to create a conversation
3. **Send message**: Frontend calls `POST /api/chat/message` → server adds message to conversation → agent generates response
4. **Agent reasoning**: The agent uses its instructions + file search over hotel policies to answer questions

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chat/start` | Start a new conversation |
| `POST` | `/api/chat/message` | Send a message (body: `{ conversationId, message }`) |
| `POST` | `/api/chat/end` | End a conversation |
| `GET`  | `/api/health` | Check agent readiness |

## Authentication

The server uses `DefaultAzureCredential` from `@azure/identity`. Make sure you are logged in via Azure CLI (`az login`) and have the appropriate role assignment on your Foundry project.
