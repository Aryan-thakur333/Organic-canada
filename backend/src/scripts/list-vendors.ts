import { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

export default async function listVendors({ container }: ExecArgs) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)

  const { data } = await query.graph({
    entity: "vendor",
    fields: ["id", "name", "store_name", "email", "status"],
  })

  console.log("Existing vendors:")
  console.log(JSON.stringify(data, null, 2))
}
