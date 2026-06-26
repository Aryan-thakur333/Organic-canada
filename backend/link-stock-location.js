const { Modules } = require("@medusajs/framework/utils")

module.exports = async function ({ container }) {
  const remoteLink = container.resolve("remoteLink")

  await remoteLink.create({
    [Modules.SALES_CHANNEL]: { sales_channel_id: "sc_01KVJF9HK0YY92JES8P7VPZN12" },
    [Modules.STOCK_LOCATION]: { stock_location_id: "sloc_01KVJF9HWWJ38MPAFDGH5YB0W1" },
  })

  console.log("✅ Stock location linked to sales channel successfully!")
}
