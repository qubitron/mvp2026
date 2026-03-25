const messagesArea = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const statusToast = document.getElementById("status-toast");

let conversationId = null;

// ---- API Helpers ----

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ---- Conversation Lifecycle ----

async function startConversation() {
  try {
    const data = await apiPost("/api/chat/start", {});
    if (data.error) throw new Error(data.error);
    conversationId = data.conversationId;
  } catch (err) {
    showToast("Unable to connect to the concierge. Retrying...");
    setTimeout(startConversation, 3000);
  }
}

async function endConversation() {
  if (conversationId) {
    await apiPost("/api/chat/end", { conversationId }).catch(() => {});
    conversationId = null;
  }
}

// ---- Message Rendering ----

function createMessageEl(role, text) {
  const msg = document.createElement("div");
  msg.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "🧑" : "🛎️";

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.innerHTML = formatMessage(text);

  msg.appendChild(avatar);
  msg.appendChild(bubble);
  return msg;
}

function formatMessage(text) {
  // Convert markdown-lite: bold, bullet lists, line breaks
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Bullet lists
  html = html.replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map((p) => `<p>${p.trim()}</p>`)
    .join("");

  // Remaining single newlines -> <br>
  html = html.replace(/\n/g, "<br>");

  return html;
}

function addMessage(role, text) {
  // Remove welcome card if present
  const welcome = messagesArea.querySelector(".welcome-card");
  if (welcome) welcome.remove();

  messagesArea.appendChild(createMessageEl(role, text));
  scrollToBottom();
}

function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "message agent";
  indicator.id = "typing-indicator";
  indicator.innerHTML = `
    <div class="message-avatar">🛎️</div>
    <div class="message-bubble">
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  messagesArea.appendChild(indicator);
  scrollToBottom();
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typing-indicator");
  if (indicator) indicator.remove();
}

function scrollToBottom() {
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

// ---- Send Message ----

async function sendMessage(text) {
  if (!text.trim()) return;

  addMessage("user", text);
  setInputEnabled(false);
  showTypingIndicator();

  // Ensure conversation is started
  if (!conversationId) {
    await startConversation();
  }

  try {
    const data = await apiPost("/api/chat/message", {
      conversationId,
      message: text,
    });

    removeTypingIndicator();

    if (data.error) {
      addMessage("agent", "I'm sorry, something went wrong. Please try again.");
      console.error("Agent error:", data.error);
    } else {
      addMessage("agent", data.reply);
    }
  } catch (err) {
    removeTypingIndicator();
    addMessage("agent", "I'm having trouble connecting right now. Please try again in a moment.");
    console.error("Network error:", err);
  }

  setInputEnabled(true);
  messageInput.focus();
}

function setInputEnabled(enabled) {
  messageInput.disabled = !enabled;
  sendBtn.disabled = !enabled;
}

// ---- New Chat ----

async function resetChat() {
  await endConversation();

  messagesArea.innerHTML = `
    <div class="welcome-card">
      <div class="welcome-icon">🛎️</div>
      <h2>Welcome to Contoso Stays</h2>
      <p>I'm your virtual concierge. Ask me anything about our hotel — policies, reservations, loyalty program, amenities, and more!</p>
      <div class="quick-actions">
        <button class="quick-btn" data-question="What are the check-in and check-out times?">🕐 Check-in times</button>
        <button class="quick-btn" data-question="What is the cancellation policy?">📋 Cancellation policy</button>
        <button class="quick-btn" data-question="Tell me about the Contoso Rewards loyalty program">⭐ Loyalty program</button>
        <button class="quick-btn" data-question="What is your pet policy?">🐾 Pet policy</button>
      </div>
    </div>`;

  bindQuickActions();
  await startConversation();
}

// ---- Toast ----

function showToast(message) {
  statusToast.textContent = message;
  statusToast.classList.remove("hidden");
  setTimeout(() => statusToast.classList.add("hidden"), 4000);
}

// ---- Quick Action Buttons ----

function bindQuickActions() {
  document.querySelectorAll(".quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const question = btn.getAttribute("data-question");
      if (question) sendMessage(question);
    });
  });
}

// ---- Wait for Agent Readiness ----

async function waitForAgent() {
  const maxRetries = 20;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.status === "ready") return true;
    } catch {
      // Server not up yet
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// ---- Initialization ----

async function init() {
  bindQuickActions();

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = messageInput.value.trim();
    messageInput.value = "";
    sendMessage(text);
  });

  newChatBtn.addEventListener("click", resetChat);

  showToast("Connecting to concierge...");
  const ready = await waitForAgent();
  if (ready) {
    showToast("Concierge is ready! 🛎️");
    await startConversation();
  } else {
    showToast("Concierge is starting up — you can still send messages.");
    await startConversation();
  }
}

init();
