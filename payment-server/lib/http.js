import { randomUUID } from "crypto";

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 * @param {Record<string, unknown>} [extra]
 */
export function sendError(res, status, code, message, extra = {}) {
  const requestId = randomUUID().slice(0, 8);
  res.status(status).json({
    ok: false,
    error: { code, message, ...extra },
    requestId,
  });
}

/**
 * @param {import('express').Response} res
 * @param {unknown} data
 */
export function sendOk(res, data) {
  res.json({ ok: true, ...data });
}
