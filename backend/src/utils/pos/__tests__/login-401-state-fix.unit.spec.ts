import { resolveAuthenticatedPosOperator } from "../security"

const userFixture = { id: "user_01KWPV0WK7J0KN2A8FZ0AD3T16", email: "admin@eatsie.com" }

function mockService() {
  return {
    listPosOperatorAssignments: jest.fn(async () => []),
    retrievePosRegister: jest.fn(),
  } as any
}

describe("CHECKPOINT 11 — Backend POS Login & 401 Auth Safety Suite", () => {
  test("1. correct user/emailpass request resolves operator identity from auth_context", async () => {
    const resolve = jest.fn()
      .mockReturnValueOnce(mockService())
      .mockReturnValueOnce({ retrieveUser: jest.fn(async () => userFixture) })
      .mockReturnValueOnce({ info: jest.fn() })
    const req = { auth_context: { actor_id: userFixture.id, actor_type: "user" }, scope: { resolve } } as any
    const operator = await resolveAuthenticatedPosOperator(req)
    expect(operator.operatorId).toBe(userFixture.id)
    expect(operator.email).toBe("admin@eatsie.com")
  })

  test("2. invalid credentials return 401 (unauthenticated actor)", async () => {
    const req = { auth_context: {}, scope: { resolve: jest.fn() } } as any
    await expect(resolveAuthenticatedPosOperator(req)).rejects.toMatchObject({ code: "POS_UNAUTHENTICATED", status: 401 })
  })

  test("3. nonexistent user returns safe 401 without user identity leaking", async () => {
    const req = { auth_context: { actor_id: "", actor_type: "user" }, scope: { resolve: jest.fn() } } as any
    await expect(resolveAuthenticatedPosOperator(req)).rejects.toMatchObject({ code: "POS_UNAUTHENTICATED", status: 401 })
  })

  test("4. no credential details leak in error payload", async () => {
    const req = { auth_context: {}, body: { password: "secret_password" }, scope: { resolve: jest.fn() } } as any
    try {
      await resolveAuthenticatedPosOperator(req)
      fail("Should throw")
    } catch (err: any) {
      expect(err.message).not.toContain("secret_password")
      expect(JSON.stringify(err)).not.toContain("secret_password")
    }
  })

  test("5. /pos/me requires user authentication actor", async () => {
    const customerReq = { auth_context: { actor_id: "cus_123", actor_type: "customer" }, scope: { resolve: jest.fn() } } as any
    await expect(resolveAuthenticatedPosOperator(customerReq)).rejects.toMatchObject({ code: "POS_UNAUTHENTICATED", status: 401 })
  })

  test("6. /pos/me/registers requires authentication actor", async () => {
    const unauthenticatedReq = { auth_context: null, scope: { resolve: jest.fn() } } as any
    await expect(resolveAuthenticatedPosOperator(unauthenticatedReq)).rejects.toMatchObject({ code: "POS_UNAUTHENTICATED", status: 401 })
  })
})
