import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import Redis from "ioredis"
import { randomUUID } from "crypto"

export default async function redisProductionPreflight({ container }: { container: MedusaContainer }) {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (!redisUrl) return
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const prefix = process.env.REDIS_PREFIX?.trim() || "eatsie"
  const client = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 5000,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  })
  client.on("error", () => undefined)
  const key = `${prefix}:preflight:${randomUUID()}`
  const owner = randomUUID()
  try {
    await client.connect()
    const pong = await client.ping()
    if (pong !== "PONG") throw new Error("Redis PING did not return PONG")
    const acquired = await client.set(key, owner, "EX", 10, "NX")
    if (acquired !== "OK") throw new Error("Redis distributed-lock preflight could not acquire a unique key")
    const released = await client.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",
      1,
      key,
      owner
    )
    if (Number(released) !== 1) throw new Error("Redis distributed-lock preflight could not release its key")
    logger.info("[POS_REDIS_PREFLIGHT] connection=PASSED lock=PASSED")
  } catch (error) {
    throw new Error(`Redis production preflight failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await client.quit().catch(() => client.disconnect())
  }
}
