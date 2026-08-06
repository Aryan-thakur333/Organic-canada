import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { createUserAccountWorkflow } from "@medusajs/medusa/core-flows"

jest.setTimeout(60 * 1000)

medusaIntegrationTestRunner({
  inApp: true,
  env: {},
  testSuite: ({ api, adminHeaders = { headers: {} }, getContainer }) => {
    describe("Commission API Flow", () => {
      beforeAll(async () => {
        const container = getContainer()
        const adminEmail = `commission-admin-${Date.now()}@eatsie.test`
        const adminPassword = "AdminPass123!"
        const authService: any = container.resolve(Modules.AUTH)
        const registration = await authService.register("emailpass", {
          body: { email: adminEmail, password: adminPassword },
        })
        expect(registration.success).toBe(true)

        await createUserAccountWorkflow(container).run({
          input: {
            authIdentityId: registration.authIdentity.id,
            userData: {
              email: adminEmail,
              first_name: "Commission",
              last_name: "Admin",
            },
          },
        })

        const adminLogin = await api.post("/auth/user/emailpass", {
          email: adminEmail,
          password: adminPassword,
        })
        expect(adminLogin.status).toBe(200)
        expect(adminLogin.data.token).toBeTruthy()

        ;(adminHeaders as any).headers ||= {}
        ;(adminHeaders as any).headers.Authorization = `Bearer ${adminLogin.data.token}`
        api.defaults.validateStatus = () => true
      })
      
      it("1. schema repair/seed creates settings", async () => {
        const response = await api.get("/admin/commission/normal_customer", adminHeaders)
        expect(response.status).toEqual(200)
        expect(response.data.setting).toBeDefined()
        expect(response.data.setting.account_type).toEqual("normal_customer")
      })

      it("2. GET normal_customer returns 200", async () => {
        const response = await api.get("/admin/commission/normal_customer", adminHeaders)
        expect(response.status).toEqual(200)
      })

      it("3. POST normal_customer saves 3", async () => {
        const response = await api.post(
          "/admin/commission/normal_customer",
          {
            fee_type: "percentage",
            fee_value: 3,
            is_active: true
          },
          adminHeaders
        )
        expect(response.status).toEqual(200)
        expect(response.data.setting.fee_value).toEqual(3)
      })

      it("4. GET normal_customer returns 3", async () => {
        const saveResponse = await api.post(
          "/admin/commission/normal_customer",
          {
            fee_type: "percentage",
            fee_value: 3,
            is_active: true
          },
          adminHeaders
        )
        expect(saveResponse.status).toEqual(200)

        const response = await api.get("/admin/commission/normal_customer", adminHeaders)
        expect(response.status).toEqual(200)
        expect(response.data.setting.fee_value).toEqual(3)
      })

      it("5. POST b2b_customer saves 4", async () => {
        const response = await api.post(
          "/admin/commission/b2b_customer",
          {
            fee_type: "percentage",
            fee_value: 4,
            is_active: true
          },
          adminHeaders
        )
        expect(response.status).toEqual(200)
        expect(response.data.setting.fee_value).toEqual(4)
      })

      it("6. POST vendor saves 6", async () => {
        const response = await api.post(
          "/admin/commission/vendor",
          {
            fee_type: "percentage",
            fee_value: 6,
            is_active: true
          },
          adminHeaders
        )
        expect(response.status).toEqual(200)
        expect(response.data.setting.fee_value).toEqual(6)
      })

      it("7. GET /admin/commissions returns 200", async () => {
        const response = await api.get("/admin/commissions?limit=10&offset=0", adminHeaders)
        expect(response.status).toEqual(200)
        expect(response.data.records).toBeDefined()
        expect(Array.isArray(response.data.records)).toBe(true)
      })

      it("8. invalid account_type returns 400", async () => {
        const response = await api.get("/admin/commission/invalid_type", adminHeaders)
        expect(response.status).toEqual(400)

        const postResponse = await api.post(
          "/admin/commission/invalid_type",
          {
            fee_type: "percentage",
            fee_value: 10
          },
          adminHeaders
        )
        expect(postResponse.status).toEqual(400)
      })

      it("9. invalid percentage > 100 returns 400", async () => {
        const response = await api.post(
          "/admin/commission/normal_customer",
          {
            fee_type: "percentage",
            fee_value: 101,
            is_active: true
          },
          adminHeaders
        )
        expect(response.status).toEqual(400)
      })
      
    })
  },
})
