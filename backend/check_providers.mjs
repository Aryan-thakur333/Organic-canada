import Medusa from "@medusajs/js-sdk";
import dotenv from "dotenv";

dotenv.config({ path: "./backend/.env" });

const sdk = new Medusa({
  baseUrl: process.env.MEDUSA_BACKEND_URL || "http://localhost:9000",
  publishableKey: "pk_f6e7283a1469dbd6b8a132839cdb54a154b20c2bf07fc5ef59cf0705e7ed2431",
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
