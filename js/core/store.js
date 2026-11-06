/* PaperWorld · 展览仓库
 * 用户上传的 PDF 存在 IndexedDB（可放几十 MB），展览蓝图存 localStorage（几十 KB）。
 * 论文文件永不离开本机，页面刷新后仍能重新打开并做原文高亮。
 */

const DB_NAME = "paperworld.v1";
const STORE = "pdf";
const INDEX_KEY = "pw.index.v1";
const PREFIX = "pw.exhibit.v1.";
const urlCache = new Map();

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putBlob(id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function delBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); }
  catch { return []; }
}
function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

export async function saveExhibition({ id, blueprint, blob }) {
  await putBlob(id, blob);
  localStorage.setItem(PREFIX + id, JSON.stringify(blueprint));
  const idx = readIndex().filter((x) => x.id !== id);
  idx.unshift({
    id,
    title: blueprint.meta.title || "未命名论文",
    created: Date.now(),
    pages: blueprint.meta.pages || 0,
    evidenceCount: Object.keys(blueprint.evidence || {}).length,
    source: blueprint.meta.sourceName || "上传的 PDF",
    auto: true,
  });
  writeIndex(idx.slice(0, 12));
  urlCache.set(id, URL.createObjectURL(blob));
  return id;
}

export function listExhibitions() {
  return readIndex();
}

export async function loadExhibition(id) {
  let blueprint = null;
  try { blueprint = JSON.parse(localStorage.getItem(PREFIX + id) || "null"); }
  catch { blueprint = null; }
  if (!blueprint) return null;
  const blob = await getBlob(id);
  if (!blob) return { blueprint, pdfUrl: null, missingPdf: true };
  if (!urlCache.has(id)) urlCache.set(id, URL.createObjectURL(blob));
  const pdfUrl = urlCache.get(id);
  blueprint.meta.pdf = pdfUrl;
  return { blueprint, pdfUrl };
}

export async function deleteExhibition(id) {
  localStorage.removeItem(PREFIX + id);
  writeIndex(readIndex().filter((x) => x.id !== id));
  if (urlCache.has(id)) { URL.revokeObjectURL(urlCache.get(id)); urlCache.delete(id); }
  try { await delBlob(id); } catch {}
}

export function makeId() {
  return "e" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}
