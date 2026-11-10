const ORDERS_URL = "https://teens.make-it.kz/api/data/u-kdcgdyns/_orders";
const FILES_URL = "https://teens.make-it.kz/api/files/u-kdcgdyns";
const PREVIEW_URL = "https://teens.make-it.kz/api/preview/u-kdcgdyns";

const form = document.querySelector("#orderForm");
const sourceInputs = [...document.querySelectorAll('input[name="sourceType"]')];
const fileBlock = document.querySelector("#fileBlock");
const descriptionBlock = document.querySelector("#descriptionBlock");
const drawingBlock = document.querySelector("#drawingBlock");
const imageInput = document.querySelector("#imageInput");
const imagePreview = document.querySelector("#imagePreview");
const dropzone = document.querySelector("#dropzone");
const descriptionInput = document.querySelector("#descriptionInput");
const descriptionCount = document.querySelector("#descriptionCount");
const noteInput = document.querySelector("#noteInput");
const submitButton = document.querySelector("#submitButton");
const formStatus = document.querySelector("#formStatus");
const clientPreviewCard = document.querySelector("#clientPreviewCard");
const clientPreviewImage = document.querySelector("#clientPreviewImage");
const drawingCanvas = document.querySelector("#drawingCanvas");
const drawingContext = drawingCanvas.getContext("2d");
const brushSize = document.querySelector("#brushSize");
const eraserButton = document.querySelector("#eraserButton");
const clearDrawingButton = document.querySelector("#clearDrawingButton");
const colorButtons = [...document.querySelectorAll(".color-dot")];
let drawing = false;
let drawingTouched = false;
let drawingColor = "#17172b";
let erasing = false;

sourceInputs.forEach(input => input.addEventListener("change", updateSourceFields));
imageInput.addEventListener("change", showPreview);
descriptionInput.addEventListener("input", () => { descriptionCount.textContent = descriptionInput.value.length; });
form.addEventListener("submit", submitOrder);
setupDrawing();

function updateSourceFields() {
  const sourceType = selected("sourceType");
  const isDescription = sourceType === "description";
  const isDrawing = sourceType === "drawing";
  fileBlock.hidden = sourceType !== "photo";
  descriptionBlock.hidden = !isDescription;
  drawingBlock.hidden = !isDrawing;
  setStatus("");
}

function setupDrawing() {
  clearDrawing();
  drawingCanvas.addEventListener("pointerdown", startDrawing);
  drawingCanvas.addEventListener("pointermove", drawLine);
  drawingCanvas.addEventListener("pointerup", stopDrawing);
  drawingCanvas.addEventListener("pointercancel", stopDrawing);
  drawingCanvas.addEventListener("pointerleave", stopDrawing);
  colorButtons.forEach(button => button.addEventListener("click", () => {
    drawingColor = button.dataset.color;
    erasing = false;
    eraserButton.classList.remove("active");
    colorButtons.forEach(item => item.classList.toggle("active", item === button));
  }));
  eraserButton.addEventListener("click", () => {
    erasing = !erasing;
    eraserButton.classList.toggle("active", erasing);
  });
  clearDrawingButton.addEventListener("click", clearDrawing);
}

function canvasPoint(event) {
  const rect = drawingCanvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * drawingCanvas.width / rect.width, y: (event.clientY - rect.top) * drawingCanvas.height / rect.height };
}

function startDrawing(event) {
  event.preventDefault();
  drawing = true;
  drawingTouched = true;
  drawingCanvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  drawingContext.beginPath();
  drawingContext.moveTo(point.x, point.y);
  drawingContext.lineTo(point.x + .1, point.y + .1);
  paintStroke();
}

function drawLine(event) {
  if (!drawing) return;
  event.preventDefault();
  const point = canvasPoint(event);
  drawingContext.lineTo(point.x, point.y);
  paintStroke();
}

function paintStroke() {
  drawingContext.strokeStyle = erasing ? "#ffffff" : drawingColor;
  drawingContext.lineWidth = Number(brushSize.value);
  drawingContext.lineCap = "round";
  drawingContext.lineJoin = "round";
  drawingContext.stroke();
}

function stopDrawing(event) {
  if (!drawing) return;
  drawing = false;
  drawingContext.closePath();
  if (event?.pointerId !== undefined && drawingCanvas.hasPointerCapture(event.pointerId)) drawingCanvas.releasePointerCapture(event.pointerId);
}

function clearDrawing() {
  drawingContext.fillStyle = "#ffffff";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  drawingTouched = false;
}

function showPreview() {
  const file = imageInput.files[0];
  if (!file) return clearPreview();
  if (!file.type.startsWith("image/")) {
    imageInput.value = "";
    clearPreview();
    return setStatus("Нужна картинка, а не видео или другой файл.", "error");
  }
  imagePreview.src = URL.createObjectURL(file);
  dropzone.classList.add("has-preview");
  setStatus("");
}

function clearPreview() {
  if (imagePreview.src) URL.revokeObjectURL(imagePreview.src);
  imagePreview.removeAttribute("src");
  dropzone.classList.remove("has-preview");
}

async function submitOrder(event) {
  event.preventDefault();
  const sourceType = selected("sourceType");
  const printChoice = selected("printChoice");
  const description = descriptionInput.value.trim();
  const originalFile = imageInput.files[0];

  if (sourceType === "description" && !description) return setStatus("Опиши фигурку, которую хочешь создать.", "error");
  if (sourceType === "photo" && !originalFile) return setStatus("Добавь картинку для заказа.", "error");
  if (sourceType === "drawing" && !drawingTouched) return setStatus("Сначала нарисуй свою фигурку.", "error");
  if (originalFile && !originalFile.type.startsWith("image/")) return setStatus("Можно отправить только картинку.", "error");

  submitButton.disabled = true;
  submitButton.textContent = "Отправляю…";
  setStatus("Сохраняю картинку и заказ…");
  clientPreviewCard.hidden = true;

  try {
    const imageBlob = sourceType === "description"
      ? await descriptionCard(description)
      : sourceType === "drawing"
        ? await drawingBlob()
        : await resizeImage(originalFile, 1200, .75);
    const imageId = await uploadImage(imageBlob, sourceType === "description" ? "description.jpg" : sourceType === "drawing" ? "drawing.jpg" : "reference.jpg");
    const imageData = imageId ? "" : await compactImageData(imageBlob);
    let previewId = "";
    let previewImage = "";
    let previewFailed = false;
    if (imageId) {
      setStatus("AI дорисовывает будущую фигурку…");
      try {
        const previewResponse = await fetch(PREVIEW_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instruction: window.PREVIEW_INSTRUCTION,
            text: [description, noteInput.value.trim()].filter(Boolean).join(". ") || "Фигурка по картинке покупателя",
            image: imageId
          })
        });
        const previewData = await readJson(previewResponse);
        const skipped = previewData.error === "skip" || previewData.result?.error === "skip";
        if (!previewResponse.ok || !previewData.ok || skipped) previewFailed = true;
        else {
          previewId = previewData.id || "";
          previewImage = previewData.image || "";
        }
      } catch {
        previewFailed = true;
      }
    } else {
      previewFailed = true;
    }
    setStatus("Сохраняю заказ…");
    const response = await fetch(ORDERS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceType,
        description,
        printChoice,
        note: noteInput.value.trim(),
        imageId,
        imageData,
        previewId,
        createdAt: new Date().toISOString()
      })
    });
    const data = await readJson(response);
    if (!response.ok || !data.ok) throw serverError(response.status, data);
    const orderNumber = String(data.id || "").slice(-8).toUpperCase();
    form.reset();
    updateSourceFields();
    clearPreview();
    clearDrawing();
    descriptionCount.textContent = "0";
    const shown = showClientPreview(previewImage);
    const previewNote = shown ? " Превью готово ниже." : previewFailed ? " Превью сейчас не получилось, но заказ сохранён." : "";
    setStatus(`Заказ принят! Номер: ${orderNumber || "сохранён"}. Запиши его, чтобы не потерять.${previewNote}`, "success");
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = "Отправить заказ <span>→</span>";
  }
}

function showClientPreview(value) {
  const src = safePreviewSource(value);
  if (!src) {
    clientPreviewCard.hidden = true;
    return false;
  }
  clientPreviewImage.src = src;
  clientPreviewCard.hidden = false;
  return true;
}

function safePreviewSource(value) {
  if (!value) return "";
  const raw = typeof value === "object" ? String(value.url || value.image || "") : String(value);
  if (raw.startsWith("data:image/")) return raw;
  try {
    const url = new URL(raw, "https://teens.make-it.kz");
    return url.protocol === "https:" && url.hostname === "teens.make-it.kz" ? url.href : "";
  } catch { return ""; }
}

function drawingBlob() {
  return new Promise((resolve, reject) => drawingCanvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Не получилось сохранить рисунок.")), "image/jpeg", .82));
}

function friendlyError(error) {
  const message = String(error?.message || "");
  if (!message || /failed to fetch|networkerror|load failed/i.test(message)) return "Не получилось связаться с сервером. Проверь интернет и попробуй ещё раз — твой заказ не потерялся.";
  return message;
}

async function uploadImage(blob, filename) {
  const response = await fetch(FILES_URL, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/jpeg" },
    body: blob
  });
  const data = await readJson(response);
  if (response.status === 403 && data.error === "feature-off") return "";
  if (!response.ok || !data.ok || !data.id) throw serverError(response.status, data);
  return data.id;
}

function compactImageData(blob) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const maxSide = 420;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", .48));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не получилось уменьшить картинку."));
    };
    image.src = url;
  });
}

function resizeImage(file, maxSide, quality = .82) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Не получилось подготовить картинку.")), "image/jpeg", quality);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Картинка не открылась. Выбери другую.")); };
    image.src = url;
  });
}

function descriptionCard(text) {
  return new Promise(resolve => {
    const canvas = document.createElement("canvas");
    canvas.width = 1200; canvas.height = 900;
    const ctx = canvas.getContext("2d");
    const gradient = ctx.createLinearGradient(0, 0, 1200, 900);
    gradient.addColorStop(0, "#6750f3"); gradient.addColorStop(1, "#ff6f91");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1200, 900);
    ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.beginPath(); ctx.arc(1000, 160, 270, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.font = "900 34px system-ui"; ctx.fillText("ИДЕЯ ДЛЯ 3D-ФИГУРКИ", 80, 105);
    ctx.font = "700 54px system-ui"; wrapText(ctx, text, 80, 230, 1040, 76, 7);
    canvas.toBlob(resolve, "image/jpeg", .86);
  });
}

function wrapText(ctx, text, x, y, width, lineHeight, maxLines) {
  const words = text.split(/\s+/); let line = ""; let row = 0;
  for (const word of words) {
    const test = `${line}${word} `;
    if (ctx.measureText(test).width > width && line) {
      ctx.fillText(line, x, y + row * lineHeight); row += 1; line = `${word} `;
      if (row >= maxLines) return;
    } else line = test;
  }
  if (row < maxLines) ctx.fillText(line, x, y + row * lineHeight);
}

function selected(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ""; }
function setStatus(message, type = "") { formStatus.textContent = message; formStatus.className = `form-status ${type}`; }
async function readJson(response) { try { return await response.json(); } catch { return {}; } }
function serverError(status, data = {}) {
  const messages = {
    404: "Хранилище не найдено — проверь код у наставника.",
    413: "Картинка слишком большая. Выбери другую.",
    415: "Нужна картинка в формате JPG, PNG или WEBP.",
    422: data.error === "unsafe-image" ? "Фото людей не принимаем. Пришли питомца, игрушку, предмет или рисунок." : "Картинка не прошла проверку. Выбери другую.",
    429: "Слишком много отправок. Подожди минуту и попробуй снова.",
    409: "В хранилище закончилось место. Напиши наставнику make it."
  };
  return new Error(messages[status] || "Не получилось отправить заказ. Проверь связь и попробуй ещё раз — введённое сохранилось.");
}
