import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

export default async function linkAdminUser({ container }) {
  const remoteLink = container.resolve(ContainerRegistrationKeys.LINK);
  
  const USER_ID = "user_01KVJ3KXV1ECDKT3MCC7G8XJ9T";
  const AUTH_IDENTITY_ID = "authid_01KVJ3KY0DK85H4K04C23W71WP";

  console.log(`Linking User ${USER_ID} to AuthIdentity ${AUTH_IDENTITY_ID}...`);

  try {
    await remoteLink.create({
      [Modules.USER]: {
        user_id: USER_ID,
      },
      [Modules.AUTH]: {
        auth_identity_id: AUTH_IDENTITY_ID,
      },
    });
    console.log("Successfully linked admin user to auth identity.");
  } catch (err) {
    console.error("Failed to link admin user:", err.message);
  }
}
