import { MedusaApp } from "@medusajs/modules-sdk"
import { loadEnv } from "@medusajs/framework/utils"

loadEnv("development", process.cwd())

// We can inspect the MedusaApp linkable keys
console.log("Loading MedusaApp...");
const app = await MedusaApp({
  workerMode: false,
})

const remoteLink = app.services.remoteLink;
console.log("Linkable keys:", Object.keys(remoteLink.modules_ || {}).map(m => ({
  module: m,
  keys: Object.keys(remoteLink.modules_[m] || {})
})));

process.exit(0);
