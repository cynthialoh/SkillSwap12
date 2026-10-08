const matches = [
  { name: "Maya Chen", initials: "MC", avatar: "peach", location: "Dubai, UAE", teach: "Photography", learn: "Graphic design", category: "Creative", level: "Advanced", credits: 6, reason: "Wants to learn design", score: "98% match", bio: "Portrait and travel photographer. I can help you get comfortable shooting in manual mode." },
  { name: "Omar Hassan", initials: "OH", avatar: "blue", location: "Abu Dhabi, UAE", teach: "Excel dashboards", learn: "Figma", category: "Technology", level: "Intermediate", credits: 5, reason: "Matches your Figma skill", score: "94% match", bio: "I build dashboards that make messy data easier to understand and use." },
  { name: "Leila Nasser", initials: "LN", avatar: "lavender", location: "Sharjah, UAE", teach: "Figma", learn: "Photography", category: "Creative", level: "Advanced", credits: 6, reason: "Direct SkillSwap opportunity", score: "92% match", bio: "Product designer sharing practical workflows, from wireframes to polished UI." },
  { name: "Daniel Reed", initials: "DR", avatar: "", location: "Remote · London, UK", teach: "Business English", learn: "Graphic design", category: "Education", level: "Advanced", credits: 4, reason: "Wants to learn design", score: "89% match", bio: "Friendly conversation practice for presentations, interviews, and everyday work." },
  { name: "Priya Shah", initials: "PS", avatar: "peach", location: "Remote · Mumbai, India", teach: "Excel", learn: "Photography", category: "Business", level: "Intermediate", credits: 5, reason: "Matches your learning goal", score: "87% match", bio: "Learn formulas, pivot tables, and the simple habits that save hours." },
  { name: "Yusuf Karim", initials: "YK", avatar: "blue", location: "Dubai, UAE", teach: "Arabic conversation", learn: "Graphic design", category: "Education", level: "Intermediate", credits: 4, reason: "New teacher in your region", score: "85% match", bio: "Practice everyday Gulf Arabic in a relaxed, supportive conversation." },
  { name: "Sofia Martin", initials: "SM", avatar: "lavender", location: "Remote · Madrid, Spain", teach: "Watercolor", learn: "Excel", category: "Creative", level: "Advanced", credits: 6, reason: "Shares your creative interests", score: "83% match", bio: "Small projects and easy techniques for starting your watercolor practice." },
  { name: "Noah Williams", initials: "NW", avatar: "", location: "Remote · Toronto, Canada", teach: "Python basics", learn: "Photography", category: "Technology", level: "Intermediate", credits: 5, reason: "Matches your learning goal", score: "81% match", bio: "Learn to write your first useful Python scripts, one step at a time." },
  { name: "Aisha Rahman", initials: "AR", avatar: "peach", location: "Dubai, UAE", teach: "Home baking", learn: "Figma", category: "Lifestyle", level: "Advanced", credits: 5, reason: "Popular in your area", score: "79% match", bio: "A patient guide to soft breads, simple cakes, and kitchen confidence." },
];

const initialSkills = {
  teach: [
    { name: "Graphic design", level: "Advanced", topics: "Layout, color, visual storytelling" },
    { name: "Figma", level: "Advanced", topics: "Components, prototyping, handoff" },
  ],
  learn: [
    { name: "Photography", level: "Beginner", topics: "Portraits and manual settings" },
    { name: "Excel", level: "Intermediate", topics: "Formulas and dashboards" },
  ],
};

const activity = [
  { title: "Taught Graphic design", detail: "Portfolio review with Maya Chen · Oct 6", amount: "+3 credits", kind: "earned" },
  { title: "Learned Excel dashboards", detail: "Session with Omar Hassan · Oct 3", amount: "−5 credits", kind: "spent" },
  { title: "Welcome credits", detail: "Profile completion reward · Sep 28", amount: "+4 credits", kind: "earned" },
];

let userSkills = loadSkills();
let savedPeople = readSaved();
let selectedCategory = "All";
let searchQuery = "";
let toastTimer;

function loadSkills() {
  try { return JSON.parse(localStorage.getItem("skillswap-skills")) || structuredClone(initialSkills); }
  catch { return structuredClone(initialSkills); }
}

function readSaved() {
  try { return JSON.parse(localStorage.getItem("skillswap-saved")) || ["Leila Nasser"]; }
  catch { return ["Leila Nasser"]; }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function avatar(person, extra = "") {
  return `<span class="person-avatar ${person.avatar || ""} ${extra}">${escapeHtml(person.initials)}</span>`;
}

function matchCard(person, full = false) {
  const saved = savedPeople.includes(person.name);
  return `<article class="${full ? "discover-card" : "match-card"}" data-name="${escapeHtml(person.name.toLowerCase())}" data-category="${escapeHtml(person.category)}">
    <div class="match-person">${avatar(person)}<div class="person-info"><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.location)} · ${escapeHtml(person.level)}</span></div><span class="match-score">${escapeHtml(person.score)}</span></div>
    ${full ? `<h3 class="listing-title">${escapeHtml(person.teach)}</h3><p class="listing-description">${escapeHtml(person.bio)}</p><div class="listing-meta"><span><strong>${person.credits} credits</strong> / session</span><span class="category-tag">${escapeHtml(person.category)}</span></div>` : `<div class="match-arrows"><span class="skill-side">Teaches ${escapeHtml(person.teach)}</span><span class="swap-arrow">⇄</span><span class="skill-side">Wants ${escapeHtml(person.learn)}</span></div><p class="match-reason"><span>✦</span>${escapeHtml(person.reason)}</p>`}
    <div class="match-actions"><button class="button button-primary request-button" data-person="${escapeHtml(person.name)}" data-skill="${escapeHtml(person.teach)}">${full ? "Request to learn" : "View match"}</button><button class="save-button ${saved ? "saved" : ""}" aria-label="${saved ? "Unsave" : "Save"} ${escapeHtml(person.name)}" data-save="${escapeHtml(person.name)}">${saved ? "♥" : "♡"}</button></div>
  </article>`;
}

function renderMatches() {
  const featured = document.getElementById("featured-matches");
  if (featured) featured.innerHTML = matches.slice(0, 3).map(person => matchCard(person)).join("");
  const discover = document.getElementById("discover-results");
  if (discover) {
    const filtered = matches.filter(person => {
      const text = `${person.name} ${person.teach} ${person.learn} ${person.bio} ${person.location}`.toLowerCase();
      return text.includes(searchQuery.toLowerCase()) && (selectedCategory === "All" || person.category === selectedCategory);
    });
    discover.innerHTML = filtered.length ? filtered.map(person => matchCard(person, true)).join("") : `<div class="empty-state">No matches yet. Try a different skill or category.</div>`;
    document.getElementById("results-count").textContent = `${filtered.length} ${filtered.length === 1 ? "person" : "people and skills"}`;
  }
  const saved = document.getElementById("saved-results");
  if (saved) {
    const items = matches.filter(person => savedPeople.includes(person.name));
    saved.innerHTML = items.length ? items.map(person => matchCard(person, true)).join("") : `<div class="empty-state">No saved teachers yet. Save people from Discover to keep them here.</div>`;
  }
}

function renderOwnedSkills() {
  for (const kind of ["teach", "learn"]) {
    const list = document.getElementById(`${kind}-list`);
    if (!list) continue;
    list.innerHTML = userSkills[kind].length ? userSkills[kind].map((skill, index) => `<div class="owned-skill"><span class="owned-skill-icon">${kind === "teach" ? "↗" : "↘"}</span><div class="owned-skill-copy"><strong>${escapeHtml(skill.name)}</strong><small>${escapeHtml(skill.level)} · ${escapeHtml(skill.topics || (kind === "teach" ? "Open to teaching" : "Open to learning"))}</small></div><button class="skill-remove" data-remove="${kind}" data-index="${index}" aria-label="Remove ${escapeHtml(skill.name)}">×</button></div>`).join("") : `<p class="skills-empty">Add a skill to help people find the right exchange for you.</p>`;
  }
}

function renderExchanges(tab = "upcoming") {
  const content = document.getElementById("exchange-content");
  const rows = {
    upcoming: [
      { icon: "✳", title: "Portfolio review & design feedback", person: "Maya Chen", meta: "Friday, Oct 10 · 3:00 PM GST · You’re teaching", state: "CONFIRMED" },
      { icon: "◉", title: "Excel dashboards for beginners", person: "Omar Hassan", meta: "Monday, Oct 13 · 6:30 PM GST · You’re learning", state: "CONFIRMED" },
    ],
    requests: [{ icon: "⇄", title: "Photography basics", person: "Leila Nasser", meta: "Direct SkillSwap · You teach Figma", state: "AWAITING REPLY" }],
    past: [{ icon: "✳", title: "Brand identity foundations", person: "Nina Patel", meta: "Completed Sep 29 · You learned", state: "COMPLETED" }],
  };
  const items = rows[tab] || [];
  content.innerHTML = items.length ? `<div class="exchange-list">${items.map(item => `<article class="exchange-row"><span class="exchange-icon">${item.icon}</span><div class="exchange-copy"><strong>${escapeHtml(item.title)}</strong><p>with ${escapeHtml(item.person)} · ${escapeHtml(item.meta)}</p></div><span class="exchange-state">${escapeHtml(item.state)}</span><button class="button button-secondary button-small exchange-details">Details</button></article>`).join("")}</div>` : `<div class="empty-state">Nothing here yet.</div>`;
}

function renderActivity() {
  const root = document.getElementById("credit-activity");
  if (root) root.innerHTML = activity.map(item => `<div class="activity-row"><span class="activity-icon ${item.kind}">${item.kind === "earned" ? "↗" : "↘"}</span><div class="activity-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div><span class="activity-amount ${item.kind}">${escapeHtml(item.amount)}</span></div>`).join("");
}

function toast(message) {
  const node = document.getElementById("toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("show"), 2600);
}

function openView(name) {
  document.querySelectorAll(".content-view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
  document.querySelectorAll(".nav-item").forEach(item => item.classList.toggle("active", item.dataset.view === name));
  const labels = { overview: "Overview", discover: "Discover", skills: "My skills", exchanges: "Exchanges", credits: "Credits", saved: "Saved", admin: "Admin" };
  document.getElementById("current-section").textContent = labels[name] || name;
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === "saved" || name === "discover") renderMatches();
}

function openSkillDialog(kind) {
  const dialog = document.getElementById("skill-dialog");
  document.getElementById("skill-kind").value = kind;
  document.getElementById("dialog-kicker").textContent = kind === "teach" ? "SHARE WHAT YOU KNOW" : "CHOOSE WHAT’S NEXT";
  document.getElementById("dialog-title").textContent = kind === "teach" ? "What can you teach?" : "What do you want to learn?";
  document.getElementById("dialog-description").textContent = kind === "teach" ? "Add a skill to help the right learners find you." : "Tell us what you want to learn and find a helpful teacher.";
  document.getElementById("skill-name").value = "";
  dialog.showModal();
  document.getElementById("skill-name").focus();
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { openView(viewButton.dataset.view); return; }

  const addButton = event.target.closest("[data-add]");
  if (addButton) { openSkillDialog(addButton.dataset.add); return; }

  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    const name = saveButton.dataset.save;
    savedPeople = savedPeople.includes(name) ? savedPeople.filter(item => item !== name) : [...savedPeople, name];
    localStorage.setItem("skillswap-saved", JSON.stringify(savedPeople));
    renderMatches();
    toast(savedPeople.includes(name) ? `${name} saved for later.` : `${name} removed from Saved.`);
    return;
  }

  const requestButton = event.target.closest(".request-button");
  if (requestButton) { toast(`Learning request sent to ${requestButton.dataset.person}.`); return; }

  const removeButton = event.target.closest("[data-remove]");
  if (removeButton) {
    const kind = removeButton.dataset.remove;
    const [removed] = userSkills[kind].splice(Number(removeButton.dataset.index), 1);
    localStorage.setItem("skillswap-skills", JSON.stringify(userSkills));
    renderOwnedSkills();
    toast(`${removed.name} removed from your ${kind === "teach" ? "teaching skills" : "learning goals"}.`);
    return;
  }

  const exchangeTab = event.target.closest("[data-exchange-tab]");
  if (exchangeTab) {
    document.querySelectorAll("[data-exchange-tab]").forEach(tab => tab.classList.toggle("active", tab === exchangeTab));
    renderExchanges(exchangeTab.dataset.exchangeTab);
    return;
  }

  const category = event.target.closest("[data-category]");
  if (category && category.classList.contains("category-pill")) {
    selectedCategory = category.dataset.category;
    document.querySelectorAll(".category-pill").forEach(pill => pill.classList.toggle("selected", pill === category));
    renderMatches();
    return;
  }

  if (event.target.closest("#admin-preview")) {
    openView("admin");
    toast("Admin screens are a prototype preview. Production admin access will be restricted.");
    return;
  }

  if (event.target.closest(".exchange-details")) toast("Session details will be available when scheduling is connected.");
  if (event.target.closest(".filter-button")) toast("More discovery filters are planned for the next build slice.");
  if (event.target.closest(".notification-button")) toast("You’re all caught up.");
  if (event.target.closest(".profile-mini")) openView("skills");
});

document.getElementById("skill-form").addEventListener("submit", event => {
  const form = event.currentTarget;
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const name = document.getElementById("skill-name").value.trim();
  const level = document.getElementById("skill-level").value;
  const kind = document.getElementById("skill-kind").value;
  if (!name) return;
  if (!userSkills[kind].some(skill => skill.name.toLowerCase() === name.toLowerCase())) {
    userSkills[kind].push({ name, level, topics: kind === "teach" ? "Open to teaching" : "Open to learning" });
    localStorage.setItem("skillswap-skills", JSON.stringify(userSkills));
  }
  document.getElementById("skill-dialog").close();
  renderOwnedSkills();
  toast(`${name} added to ${kind === "teach" ? "your teaching skills" : "your learning goals"}.`);
});

document.getElementById("discover-search").addEventListener("input", event => { searchQuery = event.target.value; renderMatches(); });
document.getElementById("global-search").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    searchQuery = event.currentTarget.value;
    document.getElementById("discover-search").value = searchQuery;
    openView("discover");
    renderMatches();
  }
});
document.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    const input = document.getElementById("global-search");
    input.focus();
  }
});

renderMatches();
renderOwnedSkills();
renderExchanges();
renderActivity();
