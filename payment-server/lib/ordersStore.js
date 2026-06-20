import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const ORDERS_FILE = join(DATA_DIR, "orders.json");

/** @type {Promise<void>} */
let writeChain = Promise.resolve();

async function ensureDataFile() {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    await readFile(ORDERS_FILE, "utf8");
  } catch {
    await writeFile(ORDERS_FILE, "[]\n", "utf8");
  }
}

/**
 * @returns {Promise<any[]>}
 */
async function readAll() {
  await ensureDataFile();
  try {
    const raw = await readFile(ORDERS_FILE, "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(orders) {
  await ensureDataFile();
  await writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf8");
}

function enqueueWrite(fn) {
  const next = writeChain.then(fn);
  writeChain = next.catch(() => {});
  return next;
}

/**
 * @param {any} order
 */
export async function insertOrder(order) {
  return enqueueWrite(async () => {
    const orders = await readAll();
    orders.unshift(order);
    await writeAll(orders);
    return order;
  });
}

/**
 * @param {string} id
 * @param {(o: any) => any} updater
 */
export async function updateOrder(id, updater) {
  return enqueueWrite(async () => {
    const orders = await readAll();
    const idx = orders.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    const next = updater(orders[idx]);
    if (!next) return null;
    orders[idx] = next;
    await writeAll(orders);
    return next;
  });
}

function normalizePhoneDigits(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (d.length <= 10) return d;
  return d.slice(-10);
}

export { normalizePhoneDigits };

/**
 * @param {{ phone?: string }} [filter]
 */
export async function listOrders(filter) {
  const orders = await readAll();
  const phone = filter?.phone?.trim();
  if (!phone) return orders;
  const norm = normalizePhoneDigits(phone);
  return orders.filter((o) => {
    const p = normalizePhoneDigits(o?.customer?.phone || "");
    return p && p === norm;
  });
}

/**
 * @param {string} id
 */
export async function getOrderById(id) {
  const orders = await readAll();
  return orders.find((o) => o.id === id) ?? null;
}

export function newOrderId() {
  return `ord_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
