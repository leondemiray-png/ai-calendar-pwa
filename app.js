const KEY = "ai_calendar_mvp_v1";

function loadState() {
  return JSON.parse(localStorage.getItem(KEY) || JSON.stringify({
    chat: [],
    chores: [] // { id, name, minutes, intervalDays, nextDueISO, lastCompletedISO }
  }));
}

function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

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

function parseChoreCommand(text) {
  const raw = text.trim();
  if (!raw.toLowerCase().startsWith("chore:")) return null;

  const parts = raw.slice(6).split("/").map(s => s.trim()).filter(Boolean);
  if (parts.length < 3) return { error: "Format: chore: name / 10m / every 14d" };

  const name = parts[0];
  const minutesMatch = parts[1].match(/(\d+)\s*m/i);
  const everyMatch = parts[2].match(/every\s*(\d+)\s*d/i);

  if (!minutesMatch || !everyMatch) return { error: "Use minutes like 10m and interval like every 14d" };

  const minutes = Number(minutesMatch[1]);
  const intervalDays = Number(everyMatch[1]);

  if (!name || !Number.isFinite(minutes) || !Number.isFinite(intervalDays)) {
    return { error: "Couldn’t read name/minutes/days." };
  }
  if (minutes <= 0 || intervalDays <= 0) {
    return { error: "Minutes and days must be > 0." };
  }

  return { name, minutes, intervalDays };
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

  // repeat AFTER completion
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

  // chat
  const chatEl = document.getElementById("chat");
  chatEl.innerHTML = "";
  for (const m of state.chat.slice(-30)) {
    const div = document.createElement("div");
    div.className = `bubble ${m.role === "me" ? "me" : "sys"}`;
    div.textContent = m.text;
    chatEl.appendChild(div);
  }

  // today
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
    text.innerHTML = `<strong>${c.name}</strong> <span class="muted">(${c.minutes} min)</span>`;

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

  const parsed = parseChoreCommand(text);
  if (!parsed) {
    addChat("sys", `Right now I only support chores.\nTry: chore: water plant / 3m / every 4d`);
  } else if (parsed.error) {
    addChat("sys", `❌ ${parsed.error}`);
  } else {
    createChore(parsed);
    addChat("sys", `Added chore: "${parsed.name}" every ${parsed.intervalDays} days (${parsed.minutes} min).`);
  }

  input.value = "";
  render();
}

document.getElementById("send").addEventListener("click", handleSend);
document.getElementById("msg").addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend();
});

render();
