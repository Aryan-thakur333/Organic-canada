import { corsPreflightFix } from "../middlewares"

describe("POS checkout CORS preflight", () => {
  test("allows localhost POS checkout credentials and Idempotency-Key", async () => {
    const previous = process.env.NODE_ENV
    process.env.NODE_ENV = "development"
    const res = { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn() } as any
    const next = jest.fn()
    await corsPreflightFix({ method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "POST", "access-control-request-headers": "content-type,idempotency-key,authorization" } } as any, res, next)
    expect(res.status).toHaveBeenCalledWith(204)
    expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "http://localhost:5173")
    expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Headers", expect.stringContaining("Idempotency-Key"))
    expect(next).not.toHaveBeenCalled()
    process.env.NODE_ENV = previous
  })
})
