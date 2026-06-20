import Medusa from "@medusajs/js-sdk";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

const sdk = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  publishableKey: "pk_c4f9bb63d7dff65a18653dceb81a54a8f5d3c4355a3d49877461d4c0d6e8ddca",
});

async function checkProviders(regionId) {
  try {
    const { payment_providers } = await sdk.store.payment.listPaymentProviders({
      region_id: regionId
    });
    console.log("Providers for region:", regionId);
    console.log(JSON.stringify(payment_providers, null, 2));
  } catch (error) {
    console.error("Error listing providers:", error.message);
  }
}

async function main() {
  let targetRegionId = process.env.VITE_MEDUSA_REGION_ID;
  if (!targetRegionId) {
    const { regions } = await sdk.store.region.list({ limit: 1 });
    targetRegionId = regions[0]?.id;
  }
  
  if (!targetRegionId) {
    console.error("No active regions found.");
    return;
  }
  await checkProviders(targetRegionId);
}

main();
