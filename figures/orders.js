const ORDERS_URL = "https://teens.make-it.kz/api/data/u-kdcgdyns/_orders";
const FILES_URL = "https://teens.make-it.kz/api/files/u-kdcgdyns";
const PREVIEW_URL = "https://teens.make-it.kz/api/preview/u-kdcgdyns";
const MODEL_URL = "https://teens.make-it.kz/api/model3d/u-kdcgdyns";
const STORAGE_KEY = "formi-owner-code-u-kdcgdyns";
const MODEL_STATE_KEY = "formi-model-jobs-u-kdcgdyns-ai-finish-v2";

const loginPanel = document.querySelector("#loginPanel");
const ordersPanel = document.querySelector("#ordersPanel");
const loginForm = document.querySelector("#loginForm");
const ownerCodeInput = document.querySelector("#ownerCode");
const loginStatus = document.querySelector("#loginStatus");
const ordersStatus = document.querySelector("#ordersStatus");
const ordersList = document.querySelector("#ordersList");
const ordersCount = document.querySelector("#ordersCount");
const emptyState = document.querySelector("#emptyState");
const logoutButton = document.querySelector("#logoutButton");
const refreshButton = document.querySelector("#refreshButton");
let refreshTimer = null;
let loadingOrders = false;
const activeModelChecks = new Set();

loginForm.addEventListener("submit", event => { event.preventDefault(); openOrders(ownerCodeInput.value.trim()); });
logoutButton.addEventListener("click", logout);
refreshButton.addEventListener("click", () => loadOrders(localStorage.getItem(STORAGE_KEY) || ""));

const savedCode = localStorage.getItem(STORAGE_KEY);
if (savedCode) openOrders(savedCode);

async function openOrders(code) {
  if (!code) return setLoginStatus("Введи код владельца.", "error");
  setLoginStatus("Проверяю код…");
  const ok = await loadOrders(code, true);
  if (!ok) return;
  localStorage.setItem(STORAGE_KEY, code);
  ownerCodeInput.value = "";
  loginPanel.hidden = true;
  ordersPanel.hidden = false;
  logoutButton.hidden = false;
  startAutoRefresh(code);
}

async function loadOrders(code, fromLogin = false) {
  if (loadingOrders) return true;
  loadingOrders = true;
  try {
    if (!code) throw new Error("Введи код владельца.");
    const response = await fetch(ORDERS_URL, { headers: ownerHeaders(code) });
    const data = await readJson(response);
    if (response.status === 403) throw new Error("Код не тот — проверь его у наставника.");
    if (!response.ok || !data.ok) throw new Error("Не получилось загрузить заказы. Проверь связь и попробуй снова.");
    const items = Array.isArray(data.items) ? [...data.items].reverse() : [];
    renderOrders(items, code);
    setLoginStatus(""); setOrdersStatus("");
    return true;
  } catch (error) {
    const message = /failed to fetch|networkerror|load failed/i.test(String(error?.message || ""))
      ? "Не получилось связаться с сервером. Проверь интернет и попробуй снова."
      : error.message;
    if (fromLogin) setLoginStatus(message, "error"); else setOrdersStatus(message, "error");
    return false;
  } finally {
    loadingOrders = false;
  }
}

function startAutoRefresh(code) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (!document.hidden) loadOrders(code);
  }, 5000);
}

function renderOrders(items, code) {
  ordersList.replaceChildren();
  ordersCount.textContent = `${items.length} ${wordForm(items.length, ["заказ", "заказа", "заказов"])}`;
  emptyState.hidden = items.length !== 0;
  items.forEach(item => ordersList.append(createOrderCard(item, code)));
}

function createOrderCard(item, code) {
  const value = item.value && typeof item.value === "object" ? item.value : item;
  const id = String(item.id || value.id || "");
  const card = element("article", "order-card");
  const imageBox = element("div", "order-image", "Загружаю картинку…");
  const info = element("div", "order-info");
  const top = element("div", "order-topline");
  top.append(element("span", "order-number", `№ ${id.slice(-8).toUpperCase() || "—"}`));
  top.append(element("time", "order-date", formatDate(value.createdAt)));
  info.append(top, element("span", "order-tag", sourceLabel(value.sourceType)));
  info.append(detail("Печать", value.printChoice === "self" ? "Самостоятельно" : "Заказать печать"));
  if (value.description) info.append(detail("Описание", value.description));
  if (value.note) info.append(detail("Важно", value.note));
  info.append(createModelPanel(id, value, code));
  card.append(imageBox, info);
  if (value.imageData && String(value.imageData).startsWith("data:image/")) {
    const image = document.createElement("img");
    image.alt = "Картинка заказа";
    image.src = value.imageData;
    imageBox.replaceChildren(image);
  } else if (value.imageId) loadPrivateImage(imageBox, value.imageId, code);
  else imageBox.textContent = "Картинка не прикреплена";
  return card;
}

function createModelPanel(orderId, order, code) {
  const panel = element("div", "model-panel");
  panel.dataset.modelOrder = orderId;
  const imageId = order.imageId;
  if (!imageId) {
    panel.append(element("p", "model-status", "Для этого заказа нет картинки из нового хранилища."));
    return panel;
  }

  const state = readModelStates()[orderId];
  if (state?.stl || state?.render) {
    showModelResult(panel, state, code, orderId);
    return panel;
  }
  if (state?.job) {
    panel.append(element("p", "model-status", modelStatusText(state.status)));
    watchModelJob(orderId, state.job, code);
    return panel;
  }

  const button = element("button", "model-button", "Создать 3D-модель");
  button.type = "button";
  button.addEventListener("click", () => startModel(orderId, order, code, button));
  panel.append(button, element("small", "model-cost", "3D создаётся платно — запуск подтверждается отдельно"));
  return panel;
}

async function startModel(orderId, order, code, button) {
  const confirmed = window.confirm("Создание 3D-модели стоит денег. Запустить генерацию?");
  if (!confirmed) return;
  button.disabled = true;
  button.textContent = order.sourceType === "drawing" ? "AI дорисовывает фигурку…" : "Запускаю 3D…";
  try {
    let modelImageId = order.previewId || order.imageId;
    let aiPreview = order.previewImage || "";
    if (order.sourceType === "drawing" && !order.previewId) {
      const previewResponse = await fetch(PREVIEW_URL, {
        method: "POST",
        headers: { ...ownerHeaders(code), "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: window.PREVIEW_INSTRUCTION,
          text: String(order.description || order.note || "Фигурка по рисунку покупателя"),
          image: order.imageId
        })
      });
      const previewData = await readJson(previewResponse);
      if (previewData.error === "skip" || previewData.result?.error === "skip") throw new Error("AI не смог дорисовать этот рисунок. Попробуй изменить линии и запустить снова.");
      if (!previewResponse.ok || !previewData.ok || !previewData.id) throw new Error("Не получилось дорисовать фигурку. Попробуй ещё раз.");
      modelImageId = previewData.id;
      aiPreview = previewData.image || "";
      button.textContent = "Создаю 3D из готовой фигурки…";
    }
    const response = await fetch(MODEL_URL, {
      method: "POST",
      headers: { ...ownerHeaders(code), "Content-Type": "application/json" },
      body: JSON.stringify({ image: modelImageId })
    });
    const data = await readJson(response);
    if (response.status === 403) throw new Error("Код владельца не подошёл.");
    if (response.status === 429) throw new Error("Слишком много запусков. Подожди минуту.");
    if (!response.ok || !data.ok || !data.job) throw new Error("Не получилось запустить 3D. Попробуй ещё раз.");
    saveModelState(orderId, { job: data.job, status: "queued", preview: aiPreview, previewId: modelImageId });
    const panel = findModelPanel(orderId);
    if (panel) panel.replaceChildren(element("p", "model-status", "3D поставлена в очередь…"));
    watchModelJob(orderId, data.job, code);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Создать 3D-модель";
    setOrdersStatus(error.message, "error");
  }
}

function watchModelJob(orderId, job, code) {
  const checkKey = `${orderId}:${job}`;
  if (activeModelChecks.has(checkKey)) return;
  activeModelChecks.add(checkKey);

  const check = async () => {
    try {
      const response = await fetch(`${MODEL_URL}/${encodeURIComponent(job)}`, { headers: ownerHeaders(code) });
      const data = await readJson(response);
      if (response.status === 403) throw new Error("Код владельца не подошёл.");
      if (!response.ok) throw new Error("Не получилось проверить 3D-модель.");
      const status = String(data.status || "processing");
      saveModelState(orderId, { job, status, stl: data.stl || "", render: data.render || "" });
      const panel = findModelPanel(orderId);

      if (data.stl || status === "done" || status === "ready" || status === "completed") {
        activeModelChecks.delete(checkKey);
        if (panel) showModelResult(panel, { stl: data.stl || "", render: data.render || "" }, code, orderId);
        return;
      }
      if (status === "failed" || status === "error") {
        activeModelChecks.delete(checkKey);
        clearModelState(orderId);
        if (panel) panel.replaceChildren(element("p", "model-status error", "3D сейчас не создалась. Попробуй запустить ещё раз."));
        return;
      }
      if (panel) panel.replaceChildren(element("p", "model-status", modelStatusText(status)));
      setTimeout(check, 5000);
    } catch (error) {
      activeModelChecks.delete(checkKey);
      const panel = findModelPanel(orderId);
      if (panel) panel.replaceChildren(element("p", "model-status error", error.message));
    }
  };
  check();
}

async function showModelResult(panel, state, code, orderId) {
  panel.replaceChildren(element("p", "model-ready", "3D-модель готова"), element("p", "model-status", "Загружаю превью и файл…"));
  const renderUrl = safeServerUrl(state.render);
  const stlUrl = safeServerUrl(state.stl);
  let loaded = false;

  try {
    if (renderUrl) {
      const renderBlob = await fetchProtectedAsset(renderUrl, code);
      const preview = document.createElement("img");
      preview.className = "model-preview";
      preview.alt = "Превью готовой 3D-модели";
      preview.src = URL.createObjectURL(renderBlob);
      panel.append(preview);
      loaded = true;
    }
    if (stlUrl) {
      const stlBlob = await fetchProtectedAsset(stlUrl, code);
      const link = element("a", "model-download", "Скачать STL для печати");
      link.href = URL.createObjectURL(stlBlob);
      link.download = `formi-${orderId || "model"}.stl`;
      panel.append(link);
      loaded = true;
    }
    const loading = panel.querySelector(".model-status");
    if (loading) loading.remove();
    if (!loaded) panel.append(element("p", "model-status", "Файлы ещё готовятся — подожди несколько секунд."));
  } catch {
    const loading = panel.querySelector(".model-status");
    if (loading) loading.textContent = "Не получилось получить файлы. Обнови страницу и попробуй снова.";
  }
}

async function fetchProtectedAsset(url, code) {
  const response = await fetch(url, { headers: ownerHeaders(code) });
  if (response.status === 403) throw new Error("Код владельца не подошёл.");
  if (!response.ok) throw new Error("Файл 3D не загрузился.");
  return response.blob();
}

function modelStatusText(status) {
  if (status === "queued") return "3D поставлена в очередь…";
  return "3D-модель создаётся…";
}

function findModelPanel(orderId) {
  return [...ordersList.querySelectorAll("[data-model-order]")].find(node => node.dataset.modelOrder === orderId) || null;
}

function readModelStates() {
  try { return JSON.parse(localStorage.getItem(MODEL_STATE_KEY) || "{}"); }
  catch { return {}; }
}

function saveModelState(orderId, state) {
  const states = readModelStates();
  states[orderId] = state;
  localStorage.setItem(MODEL_STATE_KEY, JSON.stringify(states));
}

function clearModelState(orderId) {
  const states = readModelStates();
  delete states[orderId];
  localStorage.setItem(MODEL_STATE_KEY, JSON.stringify(states));
}

function safeServerUrl(value) {
  if (!value) return "";
  try {
    const raw = typeof value === "object" ? String(value.url || value.id || "") : String(value);
    if (!raw) return "";
    if (!raw.includes("/") && !raw.includes(":")) return `${FILES_URL}/${encodeURIComponent(raw)}`;
    const url = new URL(raw, "https://teens.make-it.kz");
    return url.protocol === "https:" && url.hostname === "teens.make-it.kz" ? url.href : "";
  } catch { return ""; }
}

async function loadPrivateImage(box, imageId, code) {
  try {
    const response = await fetch(`${FILES_URL}/${encodeURIComponent(imageId)}`, { headers: ownerHeaders(code) });
    if (response.status === 404) return void (box.textContent = "Картинка удалена: сервер хранит их 30 дней");
    if (response.status === 403) return void (box.textContent = "Код не тот");
    if (!response.ok) throw new Error();
    const image = document.createElement("img");
    image.alt = "Картинка заказа";
    image.src = URL.createObjectURL(await response.blob());
    box.replaceChildren(image);
  } catch { box.textContent = "Картинка сейчас не загрузилась"; }
}

function logout() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = null;
  localStorage.removeItem(STORAGE_KEY);
  ordersList.replaceChildren();
  ordersPanel.hidden = true;
  loginPanel.hidden = false;
  logoutButton.hidden = true;
  setLoginStatus("");
}

function ownerHeaders(code) { return { "X-Owner": code }; }
function element(tag, className, text) { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; }
function detail(label, value) { const box = element("div", "order-detail"); box.append(element("small", "", label), element("p", "", String(value))); return box; }
function sourceLabel(value) { return ({ photo: "По фото", drawing: "По рисунку", description: "По описанию" })[value] || "Заказ"; }
function formatDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ru-RU", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" }); }
function wordForm(number, forms) { const n = Math.abs(number) % 100, n1 = n % 10; if (n > 10 && n < 20) return forms[2]; if (n1 > 1 && n1 < 5) return forms[1]; if (n1 === 1) return forms[0]; return forms[2]; }
function setLoginStatus(message, type = "") { loginStatus.textContent = message; loginStatus.className = `form-status ${type}`; }
function setOrdersStatus(message, type = "") { ordersStatus.textContent = message; ordersStatus.className = `form-status ${type}`; }
async function readJson(response) { try { return await response.json(); } catch { return {}; } }
