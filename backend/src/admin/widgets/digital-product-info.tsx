import { Badge, Container, Heading, Text } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * Digital Product Info Widget
 *
 * Displays on the Admin Product Detail page when the product is digital.
 * Shows: file count, version, download limit, expiry days, license requirement.
 * Accessible at zone: "product.detail.after"
 */
const DigitalProductInfoWidget = ({ product }) => {
  const [loading, setLoading] = useState(true)
  const [digitalInfo, setDigitalInfo] = useState<any>(null)

  useEffect(() => {
    if (!product) {
      setLoading(false)
      return
    }

    const meta = product.metadata || {}
    const isDigital =
      meta.is_digital === true ||
      meta.is_digital === "true" ||
      product.type?.value === "Digital Product"

    if (!isDigital) {
      setLoading(false)
      return
    }

    // Fetch digital assets from product
    const assets = product.digital_asset || []
    const downloadAssets = meta.download_assets || []
    const fileCount = assets.length + downloadAssets.length

    setDigitalInfo({
      isDigital: true,
      fileCount,
      version: meta.version || "1.0.0",
      downloadLimit: meta.download_limit || meta.download_limit === 0 ? meta.download_limit : 5,
      expiryDays: meta.download_expiry_days || 365,
      licenseRequired:
        meta.license_required === true || meta.license_required === "true",
      assetFilenames: [
        ...assets.map((a: any) => a.file_name),
        ...downloadAssets.map((a: any) => a.filename),
      ].filter(Boolean),
      requiresShipping: false,
    })
    setLoading(false)
  }, [product])

  if (loading) return null
  if (!digitalInfo) return null

  const formatFileSize = (bytes: number) => {
    if (!bytes) return ""
    const units = ["B", "KB", "MB", "GB"]
    let size = bytes
    let unit = 0
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024
      unit++
    }
    return `${size.toFixed(1)} ${units[unit]}`
  }

  return (
    <Container className="p-6 mt-4">
      <div className="flex items-center gap-2 mb-4">
        <Heading level="h2" className="text-base">
          Digital Product
        </Heading>
        <Badge size="small" color="blue">
          {digitalInfo.fileCount} file{digitalInfo.fileCount !== 1 ? "s" : ""}
        </Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <Text size="small" className="text-ui-fg-subtle font-medium">
            Version
          </Text>
          <Text className="font-mono">v{digitalInfo.version}</Text>
        </div>

        <div>
          <Text size="small" className="text-ui-fg-subtle font-medium">
            Download Limit
          </Text>
          <Text>
            {digitalInfo.downloadLimit === 0
              ? "Unlimited"
              : `${digitalInfo.downloadLimit} downloads`}
          </Text>
        </div>

        <div>
          <Text size="small" className="text-ui-fg-subtle font-medium">
            Expiry
          </Text>
          <Text>{digitalInfo.expiryDays} days after purchase</Text>
        </div>

        <div>
          <Text size="small" className="text-ui-fg-subtle font-medium">
            License Key
          </Text>
          <Badge size="small" color={digitalInfo.licenseRequired ? "green" : "grey"}>
            {digitalInfo.licenseRequired ? "Required" : "Not required"}
          </Badge>
        </div>

        <div>
          <Text size="small" className="text-ui-fg-subtle font-medium">
            Shipping
          </Text>
          <Badge size="small" color="orange">
            Not required
          </Badge>
        </div>
      </div>

      {digitalInfo.assetFilenames.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ui-border-base">
          <Text size="small" className="text-ui-fg-subtle font-medium mb-2">
            Asset Filenames
          </Text>
          <div className="flex flex-wrap gap-2">
            {digitalInfo.assetFilenames.map((name: string, i: number) => (
              <Badge key={i} size="small" color="blue">
                {name}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Container>
  )
}

export const config = {
  zone: ["product.detail.after"],
}

export default DigitalProductInfoWidget