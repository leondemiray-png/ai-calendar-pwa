const KEY = "ai_calendar_mvp_v2";

function loadState() {
  return JSON.parse(localStorage.getItem(KEY) || JSON.stringify({
    chat: [],
    chores: []
  }));
}
function saveState(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

function startOfToday() {
  const d = new Date();
  d.setHours(0,0,0,0);
  return d;
}
function addChat(role, text) {
  const state = loadState();
  state.chat.push({ role, text, ts: Date.now() });
  saveState(state);
}

// --- Helpers ---
function parseMinutes(str) {
  const m = str.match(/(\d+)\s*(m|min|mins|minute|minutes)\b/i);
  return m ? Number(m[1]) : null;
}
function parseEveryDays(str) {
  // every 4d, every 4 days, every 2 weeks
  let m = str.match(/every\s*(\d+)\s*(d|day|days)\b/i);
  if (m) return Number(m[1]);

  m = str.match(/every\s*(\d+)\s*(w|week|weeks)\b/i);
  if (m) return Number(m[1]) * 7;

  // also allow "each 14 days" or "in 14 days"
  m = str.match(/\b(\d+)\s*(d|day|days)\b/i);
  if (m && /every|each|repeat/i.test(str)) return Number(m[1]);

  m = str.match(/\b(\d+)\s*(w|week|weeks)\b/i);
  if (m && /every|each|repeat/i.test(str)) return Number(m[1]) * 7;

  return null;
}

function normalizeInput(raw) {
  return raw.trim().replace(/\s+/g, " ");
}

// --- Main parser (more “AI-like”) ---
function parseChoreLike(text) {
  const raw = normalizeInput(text);

  // Accept both with and without "chore:"
  let s = raw;
  if (/^chore:/i.test(s)) s = s.slice(6).trim();

  // Pattern 1: "name / 10m / every 14d" (with or without chore:)
  if (s.includes("/")) {
    const parts = s.split("/").map(x => x.trim()).filter(Boolean);

    // name / 10m / every 14d
    const name = parts[0] || "";
    const minutes = parseMinutes(parts.join(" "));
    const intervalDays = parseEveryDays(parts.join(" "));

    if (!name) return { error: "I need a name. Example: water plant / 3m / every 4d" };
    if (!minutes) return { error: "Add a time like 3m or 10m." };
    if (!intervalDays) return { error: "Add an interval like every 4d or every 2 weeks." };

    return { name, minutes, intervalDays };
  }

  // Pattern 2: Natural language:
  // "Water the plant every 14 days"
  // "clip nails every 2 weeks 10m"
  const minutes = parseMinutes(s) ?? 5; // default 5 min if you didn't specify
  const intervalDays = parseEveryDays(s);

  // If user wrote something like "Water the plant every 14 days" -> intervalDays exists
  if (intervalDays) {
    // Remove the time/interval words from the name to keep it clean
    let name = s
      .replace(/every\s*\d+\s*(d|day|days|w|week|weeks)\b/ig, "")
      .replace(/\b\d+\s*(m|min|mins|minute|minutes)\b/ig, "")
      .replace(/\s+/g, " ")
      .trim();

    // If name became empty, fallback
    if (!name) name = "Unnamed chore";

    return { name, minutes, intervalDays };
  }

  // Not a chore
  return null;
}

function createChore({ name, minutes, intervalDays }) {
  const state = loadState();
  const now = new Date();

  // first due date is intervalDays from now
  const nextDue = new Date(now);
  nextDue.setDate(nextDue.getDate() + intervalDays);

  state.chores.push({
    id: crypto.randomUUID(),
    name,
    minutes,
    intervalDays,
    nextDueISO: nextDue.toISOString(),
    lastCompletedISO: null
  });

  saveState(state);
}

function markChoreDone(choreId) {
  const state = loadState();
  const chore = state.chores.find(c => c.id === choreId);
  if (!chore) return;

  const now = new Date();
  chore.lastCompletedISO = now.toISOString();

  const next = new Date(now);
  next.setDate(next.getDate() + chore.intervalDays);
  chore.nextDueISO = next.toISOString();

  saveState(state);
}

function choresDueToday(state) {
  const today = startOfToday();
  return state.chores.filter(c => new Date(c.nextDueISO) <= today);
}

function render() {
  const state = loadState();

  const chatEl = document.getElementById("chat");
  chatEl.innerHTML = "";
  for (const m of state.chat.slice(-30)) {
    const div = document.createElement("div");
    div.className = `bubble ${m.role === "me" ? "me" : "sys"}`;
    div.textContent = m.text;
    chatEl.appendChild(div);
  }

  const todayEl = document.getElementById("today");
  todayEl.innerHTML = "";

  const due = choresDueToday(state);

  if (due.length === 0) {
    const p = document.createElement("div");
    p.className = "muted";
    p.textContent = "Nothing due today 🎉";
    todayEl.appendChild(p);
    return;
  }

  for (const c of due) {
    const row = document.createElement("label");
    row.className = "todo";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.addEventListener("change", () => {
      if (cb.checked) {
        markChoreDone(c.id);
        addChat("sys", `✅ Logged: "${c.name}". Next due in ${c.intervalDays} days.`);
        render();
      }
    });

    const text = document.createElement("div");
    text.innerHTML = `<strong>${c.name}</strong> <span class="muted">(${c.minutes} min · every ${c.intervalDays}d)</span>`;

    row.appendChild(cb);
    row.appendChild(text);
    todayEl.appendChild(row);
  }
}

function handleSend() {
  const input = document.getElementById("msg");
  const text = input.value.trim();
  if (!text) return;

  addChat("me", text);

  const parsed = parseChoreLike(text);

  if (!parsed) {
    addChat("sys",
      `I can add chores if you mention an interval.\nExamples:\n- water plant / 3m / every 4d\n- Water the plant every 14 days\n- clip nails every 2 weeks 10m`
    );
  } else if (parsed.error) {
    addChat("sys", `❌ ${parsed.error}`);
  } else {
    createChore(parsed);
    addChat("sys", `Added: "${parsed.name}" (about ${parsed.minutes} min) every ${parsed.intervalDays} days.`);
  }

  input.value = "";
  render();
}

document.getElementById("send").addEventListener("click", handleSend);
document.getElementById("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

render();
