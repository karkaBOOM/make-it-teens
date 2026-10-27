const DATA_URL = "https://teens.make-it.kz/api/data/u-najgyqew/wishlists";
const CLAIMS_URL = "https://teens.make-it.kz/api/data/u-najgyqew/claims";
const AI_URL = "https://teens.make-it.kz/api/ai/u-najgyqew";
const MAX_ITEMS = 15;

const themes = {
  candy: {
    background: "#fff0f5",
    panel: "#fffafc",
    text: "#5b2340",
    accent: "#e95f93",
    soft: "#ffd4e3",
    font: "Georgia, serif",
    decoration: "🎀",
    cardShape: "26px",
    mood: "dream",
    badge: "мечтательное настроение",
    title: "Мои маленькие мечты",
    subtitle: "Нежные идеи, которые сделают день особенным",
    cardIcon: "♡",
    layout: "poster", cardLayout: "grid", cardStyle: "solid", buttonStyle: "pill", backgroundPattern: "bubbles", density: "airy"
  },
  night: {
    background: "#102f3c",
    panel: "#173f4d",
    text: "#effcff",
    accent: "#6ee7d8",
    soft: "#2d6470",
    font: '"Trebuchet MS", sans-serif',
    decoration: "🌙",
    cardShape: "18px",
    mood: "night",
    badge: "космическое настроение",
    title: "Подарки с моей орбиты",
    subtitle: "Космические находки для идеального праздника",
    cardIcon: "✦",
    layout: "editorial", cardLayout: "list", cardStyle: "glass", buttonStyle: "outline", backgroundPattern: "stars", density: "cozy"
  },
  citrus: {
    background: "#f6f5c7",
    panel: "#fffdec",
    text: "#294b36",
    accent: "#e57e2c",
    soft: "#d9e99a",
    font: '"Comic Sans MS", cursive',
    decoration: "🍋",
    cardShape: "34px 16px 34px 16px",
    mood: "sunny",
    badge: "солнечное настроение",
    title: "Солнечный список",
    subtitle: "Яркие подарки для радостного настроения",
    cardIcon: "☀",
    layout: "playful", cardLayout: "collage", cardStyle: "sticker", buttonStyle: "square", backgroundPattern: "stripes", density: "cozy"
  },
  custom: {
    background: "#ece8ff",
    panel: "#fffaff",
    text: "#2f2455",
    accent: "#7b55d8",
    soft: "#d9ccff",
    font: "system-ui, sans-serif",
    decoration: "🪄",
    cardShape: "24px 8px 24px 8px",
    mood: "custom",
    badge: "твоё настроение",
    title: "Мой особенный список",
    subtitle: "Оформление, созданное специально по твоим словам",
    cardIcon: "◆",
    layout: "split", cardLayout: "grid", cardStyle: "outline", buttonStyle: "pill", backgroundPattern: "waves", density: "airy"
  }
};

const creatorView = document.querySelector("#creatorView");
const wishlistView = document.querySelector("#wishlistView");
const form = document.querySelector("#wishlistForm");
const saveButton = document.querySelector("#saveButton");
const formError = document.querySelector("#formError");
const successCard = document.querySelector("#successCard");
const wishlistLink = document.querySelector("#wishlistLink");
const copyButton = document.querySelector("#copyButton");
const openButton = document.querySelector("#openButton");
const copyStatus = document.querySelector("#copyStatus");
const moreIdeasButton = document.querySelector("#moreIdeasButton");
const generatedPreview = document.querySelector("#generatedPreview");
let currentWishlist = null;

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
  formError.scrollIntoView({ behavior: "smooth", block: "center" });
}

function getCleanBaseUrl() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function chosenTheme() {
  const name = new FormData(form).get("theme") || "candy";
  return themes[name] || themes.candy;
}

function collectHobbies() {
  return [...document.querySelectorAll(".hobby-input")]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

function parseIdeas(result, amount) {
  if (!result || result.error) throw new Error("ai-unavailable");
  const raw = typeof result === "string" ? result : (result.text || result.output || JSON.stringify(result));
  const clean = String(raw).replace(/```json|```/gi, "").trim();
  let ideas = [];
  try {
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start >= 0 && end > start) ideas = JSON.parse(clean.slice(start, end + 1));
  } catch (error) {
    ideas = [];
  }
  if (!Array.isArray(ideas) || ideas.length < amount) {
    ideas = clean.split(/\r?\n/).map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim()).filter(Boolean);
  }
  ideas = ideas.map((item) => String(item).trim()).filter(Boolean).slice(0, amount);
  if (ideas.length < amount) throw new Error("bad-ai-result");
  return ideas;
}

async function askAiForIdeas(hobbies, budget, amount, existing = []) {
  const instruction = `Подбери ровно ${amount} конкретных товаров для виш листа. Учитывай увлечения и бюджет на один подарок. Не повторяй уже выбранные товары. Ответь только JSON-массивом из ${amount} коротких строк без пояснений.`;
  const text = `Увлечения: ${hobbies.join(", ")}. Бюджет: ${budget}. Уже выбрано: ${existing.length ? existing.join(", ") : "ничего"}.`;
  const response = await fetch(AI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction, text })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error("ai-unavailable");
  return parseIdeas(data.result, amount);
}

function parseThemeResult(result) {
  if (!result || result.error) return null;
  if (typeof result === "object") return result;
  const clean = String(result).replace(/```json|```/gi, "").trim();
  try {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  } catch (error) {
    return null;
  }
  return null;
}

async function askAiForTheme(words, hobbies, fallbackTheme) {
  try {
    const response = await fetch(AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: window.AI_INSTRUCTION,
        text: `Слова покупателя: ${words}. Увлечения: ${hobbies.join(", ")}.`
      })
    });
    if (response.status === 451) throw new Error("personal-data");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || (data.result && data.result.error === "skip")) {
      return { theme: fallbackTheme, usedAi: false };
    }
    const theme = parseThemeResult(data.result);
    return theme ? { theme: { ...theme, mood: "custom" }, usedAi: true } : { theme: fallbackTheme, usedAi: false };
  } catch (error) {
    if (error.message === "personal-data") throw error;
    return { theme: fallbackTheme, usedAi: false };
  }
}

async function storeWishlist(wishlist) {
  const response = await fetch(DATA_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ownerName: wishlist.ownerName, occasion: wishlist.occasion, hobbies: wishlist.hobbies, items: wishlist.items, theme: wishlist.theme })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || data.id === undefined) throw new Error("save-failed");
  return data.id;
}

function renderGeneratedPreview(items) {
  generatedPreview.replaceChildren();
  items.forEach((item) => {
    const row = document.createElement("li");
    row.textContent = item;
    generatedPreview.append(row);
  });
}

function showSuccess(id) {
  const shareUrl = `${getCleanBaseUrl()}?id=${encodeURIComponent(id)}`;
  wishlistLink.href = shareUrl;
  wishlistLink.textContent = shareUrl;
  openButton.onclick = () => window.location.assign(shareUrl);
  renderGeneratedPreview(currentWishlist.items);
  moreIdeasButton.disabled = currentWishlist.items.length >= MAX_ITEMS;
  successCard.hidden = false;
  successCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function saveWishlist(event) {
  event.preventDefault();
  formError.hidden = true;
  successCard.hidden = true;

  const ownerName = document.querySelector("#ownerNameInput").value.trim();
  const occasion = document.querySelector("#occasionInput").value.trim();
  if (!ownerName) {
    showFormError("Напиши имя или никнейм без фамилии.");
    return;
  }
  if (!occasion) {
    showFormError("Напиши повод для виш листа.");
    return;
  }
  const hobbies = collectHobbies();
  if (hobbies.length !== 3) {
    showFormError("Заполни три увлечения — по одному в каждом поле.");
    return;
  }
  const budget = document.querySelector("#budgetInput").value.trim();
  if (!budget) {
    showFormError("Напиши бюджет на один подарок.");
    return;
  }
  const moodWords = document.querySelector("#moodWords").value.trim();
  if (!moodWords) {
    showFormError("Опиши себя и настроение парой слов.");
    return;
  }

  saveButton.disabled = true;
  saveButton.firstElementChild.textContent = "AI подбирает…";

  try {
    const items = await askAiForIdeas(hobbies, budget, 5);
    saveButton.firstElementChild.textContent = "AI оформляет…";
    const styled = await askAiForTheme(moodWords, hobbies, chosenTheme());
    currentWishlist = { ownerName, occasion, hobbies, budget, items, theme: safeTheme(styled.theme) };
    saveButton.firstElementChild.textContent = "Сохраняю…";
    const id = await storeWishlist(currentWishlist);
    showSuccess(id);
    copyStatus.textContent = styled.usedAi
      ? "AI создал оформление по твоим словам."
      : "AI сейчас не оформил список — использовано выбранное настроение.";
  } catch (error) {
    showFormError(error.message === "personal-data"
      ? "Не пиши телефон или почту — эти данные могут увидеть другие."
      : "Сейчас AI не смог собрать виш лист. Попробуй ещё раз — всё введённое осталось на месте.");
  } finally {
    saveButton.disabled = false;
    saveButton.firstElementChild.textContent = "Подобрать товары";
  }
}

async function addMoreIdeas() {
  if (!currentWishlist || currentWishlist.items.length >= MAX_ITEMS) return;
  formError.hidden = true;
  moreIdeasButton.disabled = true;
  moreIdeasButton.textContent = "AI подбирает…";
  try {
    const amount = Math.min(3, MAX_ITEMS - currentWishlist.items.length);
    const extra = await askAiForIdeas(currentWishlist.hobbies, currentWishlist.budget, amount, currentWishlist.items);
    currentWishlist.items = [...currentWishlist.items, ...extra].slice(0, MAX_ITEMS);
    const id = await storeWishlist(currentWishlist);
    showSuccess(id);
    copyStatus.textContent = "Добавлены новые идеи — ссылка обновилась.";
  } catch (error) {
    showFormError("Сейчас не получилось добавить идеи. Попробуй ещё раз позже.");
  } finally {
    moreIdeasButton.textContent = "＋ Ещё 3 идеи";
    moreIdeasButton.disabled = !currentWishlist || currentWishlist.items.length >= MAX_ITEMS;
  }
}

async function copyShareLink() {
  const link = wishlistLink.href;
  try {
    await navigator.clipboard.writeText(link);
    copyStatus.textContent = "Ссылка скопирована ✦";
  } catch (error) {
    wishlistLink.focus();
    copyStatus.textContent = "Выдели и скопируй ссылку выше.";
  }
}

function safeTheme(theme) {
  const fallback = themes.candy;
  if (!theme || typeof theme !== "object") return fallback;
  const template = Object.values(themes).find((item) => item.background === theme.background) || fallback;
  const allowedFonts = [
    "system-ui, sans-serif",
    "Georgia, serif",
    '"Trebuchet MS", sans-serif',
    '"Comic Sans MS", cursive',
    '"Courier New", monospace'
  ];
  const color = (value, backup) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : backup;
  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((part) => {
      const value = parseInt(part, 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (first, second) => {
    const light = Math.max(luminance(first), luminance(second));
    const dark = Math.min(luminance(first), luminance(second));
    return (light + 0.05) / (dark + 0.05);
  };
  const background = color(theme.background, template.background);
  const panel = color(theme.panel, template.panel);
  let text = color(theme.text, template.text);
  const cardShape = Number.isFinite(Number(theme.cardShape))
    ? `${Math.min(48, Math.max(0, Number(theme.cardShape)))}px`
    : typeof theme.cardShape === "string" && /^[0-9]+px$/.test(theme.cardShape)
      ? theme.cardShape
      : template.cardShape;
  if (contrast(text, background) < 3 || contrast(text, panel) < 3) text = template.text;
  const option = (value, allowed, backup) => allowed.includes(value) ? value : backup;
  return {
    background,
    panel,
    text,
    accent: color(theme.accent, template.accent),
    soft: color(theme.soft, template.soft),
    font: allowedFonts.includes(theme.font) ? theme.font : template.font,
    decoration: typeof theme.decoration === "string" ? theme.decoration.slice(0, 4) : template.decoration,
    cardShape,
    mood: ["dream", "night", "sunny", "custom"].includes(theme.mood) ? theme.mood : template.mood,
    badge: typeof theme.badge === "string" ? theme.badge.slice(0, 50) : template.badge,
    title: typeof theme.title === "string" ? theme.title.slice(0, 80) : template.title,
    subtitle: typeof theme.subtitle === "string" ? theme.subtitle.slice(0, 120) : template.subtitle,
    cardIcon: typeof theme.cardIcon === "string" ? theme.cardIcon.slice(0, 3) : template.cardIcon,
    layout: option(theme.layout, ["poster", "split", "editorial", "playful"], template.layout || "poster"),
    cardLayout: option(theme.cardLayout, ["grid", "list", "collage"], template.cardLayout || "grid"),
    cardStyle: option(theme.cardStyle, ["solid", "outline", "glass", "sticker"], template.cardStyle || "solid"),
    buttonStyle: option(theme.buttonStyle, ["pill", "square", "outline"], template.buttonStyle || "pill"),
    backgroundPattern: option(theme.backgroundPattern, ["bubbles", "stripes", "stars", "waves", "clean"], template.backgroundPattern || "clean"),
    density: option(theme.density, ["airy", "cozy"], template.density || "airy")
  };
}

function applyTheme(theme) {
  const safe = safeTheme(theme);
  const root = document.querySelector("#publicWishlist");
  root.style.setProperty("--theme-bg", safe.background);
  root.style.setProperty("--theme-panel", safe.panel);
  root.style.setProperty("--theme-ink", safe.text);
  root.style.setProperty("--theme-accent", safe.accent);
  root.style.setProperty("--theme-soft", safe.soft);
  root.style.setProperty("--theme-font", safe.font);
  root.style.setProperty("--theme-radius", safe.cardShape);
  root.dataset.mood = safe.mood;
  root.dataset.layout = safe.layout;
  root.dataset.cardLayout = safe.cardLayout;
  root.dataset.cardStyle = safe.cardStyle;
  root.dataset.buttonStyle = safe.buttonStyle;
  root.dataset.pattern = safe.backgroundPattern;
  root.dataset.density = safe.density;
  document.querySelector("#publicDecoration").textContent = safe.decoration;
  document.querySelector("#publicBadge").textContent = safe.badge;
  document.querySelector("#publicTitle").textContent = safe.title;
  document.querySelector("#publicSubtitle").textContent = safe.subtitle;
  root.dataset.cardIcon = safe.cardIcon;
}

function findClaim(claims, wishlistId, itemIndex) {
  return claims.find((claim) =>
    String(claim.wishlistId) === String(wishlistId) &&
    Number(claim.itemIndex) === itemIndex &&
    claim.action === "claim"
  );
}

function deviceClaimKey(wishlistId) {
  return `wishshop-claimed-${wishlistId}`;
}

function getDeviceClaim(wishlistId) {
  try {
    const saved = localStorage.getItem(deviceClaimKey(wishlistId));
    return saved === null ? null : Number(saved);
  } catch (error) {
    return null;
  }
}

function saveDeviceClaim(wishlistId, itemIndex) {
  try {
    localStorage.setItem(deviceClaimKey(wishlistId), String(itemIndex));
  } catch (error) {
    // Бронь всё равно сохраняется на сервере, даже если браузер запретил локальное хранилище.
  }
}

function showDeviceLimit(card) {
  const oldControls = card.querySelector(".claim-controls");
  if (oldControls) oldControls.remove();
  if (card.querySelector(".device-limit")) return;
  const note = document.createElement("div");
  note.className = "device-limit";
  note.textContent = "С этого устройства уже выбран подарок";
  card.append(note);
}

function applyDeviceLimit(wishlistId, chosenIndex) {
  const cards = [...document.querySelectorAll("#publicItems > li")];
  cards.forEach((card, index) => {
    if (index !== chosenIndex && !card.classList.contains("is-claimed")) showDeviceLimit(card);
  });
}

async function loadClaims() {
  const response = await fetch(CLAIMS_URL);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok || !Array.isArray(data.items)) return [];
  return data.items;
}

function showClaimed(card, nickname) {
  const oldControls = card.querySelector(".claim-controls");
  if (oldControls) oldControls.remove();
  const badge = document.createElement("div");
  badge.className = "claimed-badge";
  const label = document.createElement("span");
  label.textContent = "Уже занят";
  const name = document.createElement("strong");
  name.textContent = `Подарит: ${nickname}`;
  badge.append(label, name);
  card.classList.add("is-claimed");
  card.append(badge);
}

async function claimGift(card, wishlistId, itemIndex, nickname, submitButton, message) {
  const deviceClaim = getDeviceClaim(wishlistId);
  if (deviceClaim !== null && deviceClaim !== itemIndex) {
    showDeviceLimit(card);
    return;
  }
  submitButton.disabled = true;
  submitButton.textContent = "Проверяю…";
  message.textContent = "";
  try {
    const latestClaims = await loadClaims();
    const existing = findClaim(latestClaims, wishlistId, itemIndex);
    if (existing) {
      showClaimed(card, existing.nickname || "друг");
      return;
    }

    submitButton.textContent = "Занимаю…";
    const response = await fetch(CLAIMS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wishlistId: String(wishlistId),
        itemIndex,
        nickname,
        action: "claim"
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error("claim-failed");
    saveDeviceClaim(wishlistId, itemIndex);
    showClaimed(card, nickname);
    applyDeviceLimit(wishlistId, itemIndex);
  } catch (error) {
    message.textContent = "Не получилось занять подарок. Попробуй ещё раз.";
    submitButton.disabled = false;
    submitButton.textContent = "Подтвердить";
  }
}

function renderItems(items, claims, wishlistId) {
  const list = document.querySelector("#publicItems");
  list.replaceChildren();
  const deviceClaim = getDeviceClaim(wishlistId);
  items.forEach((item, index) => {
    const card = document.createElement("li");
    card.style.animationDelay = `${index * 45}ms`;

    const wishName = document.createElement("div");
    wishName.className = "wish-name";
    wishName.textContent = String(item);
    const cardDecoration = document.createElement("span");
    cardDecoration.className = "card-decoration";
    cardDecoration.setAttribute("aria-hidden", "true");
    cardDecoration.textContent = document.querySelector("#publicWishlist").dataset.cardIcon || "✦";
    card.append(wishName, cardDecoration);

    const existing = findClaim(claims, wishlistId, index);
    if (existing) {
      showClaimed(card, existing.nickname || "друг");
    } else if (deviceClaim !== null && deviceClaim !== index) {
      showDeviceLimit(card);
    } else {
      const controls = document.createElement("div");
      controls.className = "claim-controls";

      const openButton = document.createElement("button");
      openButton.className = "claim-button";
      openButton.type = "button";
      openButton.textContent = "Занять подарок";

      const claimForm = document.createElement("form");
      claimForm.className = "claim-form";
      claimForm.hidden = true;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 30;
      input.placeholder = "Ник или имя";
      input.setAttribute("aria-label", `Ник или имя для подарка ${index + 1}`);

      const submitButton = document.createElement("button");
      submitButton.type = "submit";
      submitButton.textContent = "Подтвердить";

      const privacyNote = document.createElement("small");
      privacyNote.textContent = "Без фамилии и телефона";

      const message = document.createElement("p");
      message.className = "claim-message";
      message.setAttribute("aria-live", "polite");

      openButton.addEventListener("click", () => {
        claimForm.hidden = false;
        openButton.hidden = true;
        input.focus();
      });

      claimForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const nickname = input.value.trim();
        if (!nickname) {
          message.textContent = "Напиши ник или имя.";
          return;
        }
        await claimGift(card, wishlistId, index, nickname, submitButton, message);
      });

      claimForm.append(input, submitButton, privacyNote, message);
      controls.append(openButton, claimForm);
      card.append(controls);
    }
    list.append(card);
  });
}

function renderHobbies(hobbies) {
  const box = document.querySelector("#publicHobbies");
  box.replaceChildren();
  if (!Array.isArray(hobbies) || hobbies.length === 0) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  hobbies.slice(0, 3).forEach((hobby) => {
    const tag = document.createElement("span");
    tag.textContent = String(hobby);
    box.append(tag);
  });
}

function renderWishlistMeta(ownerName, occasion) {
  const meta = document.querySelector("#publicMeta");
  const parts = [];
  if (ownerName) parts.push(String(ownerName).slice(0, 30));
  if (occasion) parts.push(`повод: ${String(occasion).slice(0, 60)}`);
  meta.textContent = parts.join(" · ");
  meta.hidden = parts.length === 0;
}

async function openPublicWishlist(id) {
  creatorView.hidden = true;
  wishlistView.hidden = false;
  document.querySelector("#backLink").href = getCleanBaseUrl();
  const loading = document.querySelector("#loadingState");
  const errorBox = document.querySelector("#publicError");
  const list = document.querySelector("#publicItems");

  try {
    const [response, claims] = await Promise.all([
      fetch(`${DATA_URL}/${encodeURIComponent(id)}`),
      loadClaims()
    ]);
    const data = await response.json().catch(() => ({}));
    const record = data.item;
    if (!response.ok || !data.ok || !record || !Array.isArray(record.items)) {
      throw new Error("not-found");
    }
    applyTheme(record.theme);
    renderWishlistMeta(record.ownerName, record.occasion);
    renderHobbies(record.hobbies);
    renderItems(record.items.slice(0, MAX_ITEMS), claims, id);
    loading.hidden = true;
    list.hidden = false;
  } catch (error) {
    loading.hidden = true;
    errorBox.hidden = false;
    document.querySelector("#publicErrorText").textContent = "Проверь ссылку или попробуй обновить страницу позже.";
  }
}

form.addEventListener("submit", saveWishlist);
copyButton.addEventListener("click", copyShareLink);
moreIdeasButton.addEventListener("click", addMoreIdeas);

const wishlistId = new URLSearchParams(window.location.search).get("id");
if (wishlistId) openPublicWishlist(wishlistId);
