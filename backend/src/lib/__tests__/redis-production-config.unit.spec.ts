describe("production Redis module configuration", () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = {
      ...originalEnv,
      MEDUSA_SKIP_ENV_CHECK: "true",
      REDIS_URL: "redis://127.0.0.1:6379",
      REDIS_TLS: "false",
      REDIS_PREFIX: "eatsie-test",
    }
  })

  afterAll(() => { process.env = originalEnv })

  it("replaces local event, workflow, cache, and lock modules when REDIS_URL exists", () => {
    const config = require("../../../medusa-config").default
    expect(config.modules.event_bus.resolve).toContain("event-bus-redis")
    expect(config.modules.workflows.resolve).toContain("workflow-engine-redis")
    expect(config.modules.cache.resolve).toContain("cache-redis")
    expect(config.modules.locking.options.providers[0]).toMatchObject({ id: "locking-redis", is_default: true })
    expect(config.modules.event_bus.options.queueName).toBe("eatsie-test:events")
    expect(config.modules.event_bus.options.jobOptions.attempts).toBe(5)
  })

  it("keeps explicit local fallbacks when REDIS_URL is absent outside production", () => {
    delete process.env.REDIS_URL
    jest.resetModules()
    const config = require("../../../medusa-config").default
    expect(config.modules.event_bus.resolve).toContain("event-bus-local")
    expect(config.modules.workflows.resolve).toContain("workflow-engine-inmemory")
  })

  it("rejects TLS mode unless the endpoint uses rediss", () => {
    process.env.REDIS_TLS = "true"
    jest.resetModules()
    expect(() => require("../../../medusa-config")).toThrow("rediss://")
  })
})
