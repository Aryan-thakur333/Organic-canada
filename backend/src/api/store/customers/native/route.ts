import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import { createCustomerAccountWorkflow } from "@medusajs/core-flows"
import { generateJwtTokenForAuthIdentity } from "@medusajs/medusa/api/auth/utils/generate-jwt-token"

type NativeCustomerSignupBody = {
  email: string
  password: string
  first_name?: string
  last_name?: string
  phone?: string
}

export const POST = async (
  req: MedusaRequest<NativeCustomerSignupBody>,
  res: MedusaResponse
) => {
  const { email, password, first_name, last_name, phone } = req.body

  if (!email || !password) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Email and password are required"
    )
  }

  const authService = req.scope.resolve(Modules.AUTH)

  const { success, error, authIdentity } = await authService.register(
    "emailpass",
    {
      url: req.url,
      headers: req.headers,
      query: req.query,
      body: { email, password },
      protocol: req.protocol,
    }
  )

  if (!success || !authIdentity) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      error || "Unable to create email/password credentials"
    )
  }

  const { result: customer } = await createCustomerAccountWorkflow(req.scope).run({
    input: {
      authIdentityId: authIdentity.id,
      customerData: {
        email,
        first_name: first_name || "",
        last_name: last_name || "",
        phone: phone || "",
      },
    },
  })

  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const freshAuthIdentity = await authService.retrieveAuthIdentity(authIdentity.id, {
    relations: ["provider_identities"],
  })

  const token = await generateJwtTokenForAuthIdentity(
    {
      authIdentity: freshAuthIdentity,
      actorType: "customer",
      authProvider: "emailpass",
      container: req.scope,
    },
    {
      secret: config.projectConfig.http.jwtSecret,
      expiresIn: config.projectConfig.http.jwtExpiresIn,
      options: config.projectConfig.http.jwtOptions,
    }
  )

  return res.status(201).json({ customer, token })
}
