/* PaperWorld · 展览仓库
 * 用户上传的 PDF 存在 IndexedDB（可放几十 MB），展览蓝图存 localStorage（几十 KB）。
 * 论文文件永不离开本机，页面刷新后仍能重新打开并做原文高亮。
 */

const DB_NAME = "paperworld.v1";
const DB_VERSION = 2;
const STORE = "pdf";
const BP_STORE = "blueprint";
const INDEX_KEY = "pw.index.v1";
const PREFIX = "pw.exhibit.v1.";
const urlCache = new Map();

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      // v2：大蓝图在 localStorage 放不下时迁移到这里，不影响旧数据读取。
      if (!db.objectStoreNames.contains(BP_STORE)) db.createObjectStore(BP_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txPut(storeName, key, value) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}
function txGet(storeName, key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result || null); };
    req.onerror = () => { db.close(); reject(req.error); };
  }));
}
function txDel(storeName, key) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  }));
}

async function putBlob(id, blob) { return txPut(STORE, id, blob); }
async function getBlob(id) { return txGet(STORE, id); }
async function delBlob(id) { return txDel(STORE, id); }
async function putBlueprint(id, blueprint) { return txPut(BP_STORE, id, blueprint); }
async function delBlueprint(id) { return txDel(BP_STORE, id); }

function readIndex() {
  try { return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]"); }
  catch { return []; }
}
function writeIndex(list) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(list));
}

async function migrateBlueprint(id) {
  const raw = localStorage.getItem(PREFIX + id);
  if (!raw) return false;
  try {
    await putBlueprint(id, JSON.parse(raw));
    localStorage.removeItem(PREFIX + id);
    return true;
  } catch { return false; }
}

async function commitIndex(list, keepId) {
  try { writeIndex(list); return; }
  catch (e) {
    // localStorage 满时，不删除旧展览：把最旧的蓝图迁到 IndexedDB，腾出键值空间后重试。
    for (const old of list.slice().reverse()) {
      if (old.id === keepId) continue;
      if (await migrateBlueprint(old.id)) {
        try { writeIndex(list); return; } catch { /* 继续迁下一条 */ }
      }
    }
    throw e;
  }
}

export async function saveExhibition({ id, blueprint, blob }) {
  const json = JSON.stringify(blueprint);
  const existed = readIndex().some((x) => x.id === id);
  await putBlob(id, blob);
  let inLocal = true;
  try { localStorage.setItem(PREFIX + id, json); }
  catch { inLocal = false; await putBlueprint(id, blueprint); }
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
  try { await commitIndex(idx.slice(0, 12), id); }
  catch (e) {
    // 只有全新展览才清理这次写入的残留；重试保存旧展览时绝不能删掉原数据。
    if (!existed) {
      if (inLocal) { try { localStorage.removeItem(PREFIX + id); } catch {} }
      try { await delBlob(id); await delBlueprint(id); } catch {}
    }
    throw new Error("本机展览库已满，旧展览已尽量迁移但仍然写不下。请清理浏览器站点数据后重试。");
  }
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
  if (!blueprint) {
    try { blueprint = await txGet(BP_STORE, id); } catch { blueprint = null; }
  }
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
  try { await delBlueprint(id); } catch {}
}

export function makeId() {
  return "e" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}
