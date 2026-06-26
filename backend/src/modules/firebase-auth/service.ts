import { AbstractAuthModuleProvider, MedusaError } from "@medusajs/framework/utils"
import type {
  AuthenticationInput,
  AuthenticationResponse,
  AuthIdentityProviderService,
} from "@medusajs/framework/types"
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

type FirebaseAuthOptions = {
  projectId?: string
  clientEmail?: string
  privateKey?: string
}

export default class FirebaseAuthProviderService extends AbstractAuthModuleProvider {
  static identifier = "firebase"
  static DISPLAY_NAME = "Firebase Authentication"

  protected canCheckRevocation_: boolean

  constructor(_: unknown, options: FirebaseAuthOptions) {
    // @ts-expect-error Medusa injects provider constructor arguments at runtime.
    super(...arguments)
    if (!getApps().length) {
      const credential = options.clientEmail && options.privateKey
        ? cert({
            projectId: options.projectId,
            clientEmail: options.clientEmail,
            privateKey: options.privateKey.replace(/\\n/g, "\n"),
          })
        : undefined
      initializeApp({ ...(credential ? { credential } : {}), projectId: options.projectId })
    }
    this.canCheckRevocation_ = Boolean(options.clientEmail && options.privateKey)
  }

  async authenticate(
    input: AuthenticationInput,
    identityService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    const idToken = (input.body as Record<string, unknown> | undefined)?.id_token
    if (typeof idToken !== "string" || !idToken) {
      return { success: false, error: "Firebase ID token is required" }
    }

    try {
      const decoded = await getAuth().verifyIdToken(idToken, this.canCheckRevocation_)
      if (!decoded.email || decoded.email_verified !== true) {
        return { success: false, error: "A verified Firebase email is required" }
      }

      const userMetadata = {
        email: decoded.email.toLowerCase(),
        name: decoded.name || "",
        picture: decoded.picture || "",
        firebase_uid: decoded.uid,
      }
      let authIdentity
      try {
        await identityService.retrieve({ entity_id: decoded.uid })
        authIdentity = await identityService.update(decoded.uid, { user_metadata: userMetadata })
      } catch (error: any) {
        if (error.type !== MedusaError.Types.NOT_FOUND) throw error
        authIdentity = await identityService.create({
          entity_id: decoded.uid,
          user_metadata: userMetadata,
        })
      }
      return { success: true, authIdentity }
    } catch (error: any) {
      return { success: false, error: error.message || "Invalid Firebase ID token" }
    }
  }

  async register(
    input: AuthenticationInput,
    identityService: AuthIdentityProviderService
  ): Promise<AuthenticationResponse> {
    return this.authenticate(input, identityService)
  }
}
