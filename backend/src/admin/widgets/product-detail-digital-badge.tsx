import { Badge, Container, Text } from "@medusajs/ui"
import { defineWidgetConfig } from "@medusajs/admin-sdk"

/**
 * Product Detail Digital Badge Widget
 *
 * Shows a prominent "Digital Product" badge at the top of the
 * Admin Product Detail page when the product is digital.
 * Zone: product.details.before
 */
const ProductDetailDigitalBadge = ({ product }) => {
  if (!product) return null

  const meta = product.metadata || {}
  const isDigital =
    meta.is_digital === true ||
    meta.is_digital === "true" ||
    product.type?.value === "Digital Product" ||
    (product.digital_asset && product.digital_asset.length > 0)

  if (!isDigital) return null

  return (
    <Container className="p-4 mb-4 bg-ui-bg-subtle border border-ui-border-base rounded-lg">
      <div className="flex items-center gap-3">
        <Badge size="xsmall" color="blue" className="uppercase tracking-wider">
          Digital Product
        </Badge>
        <Text size="small" className="text-ui-fg-subtle">
          This is a downloadable digital product — no shipping or fulfillment required.
        </Text>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.before",
})

export default ProductDetailDigitalBadge
