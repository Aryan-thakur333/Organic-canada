import { Badge, Button, Container, Heading, Input, Text, Table, StatusBadge, Tooltip, toast } from "@medusajs/ui"
import { useEffect, useState, useCallback } from "react"

/**
 * Digital Products List Page (Medusa Admin Extension)
 *
 * Lists all products that are digital (metadata.is_digital === true).
 * Shows file count, version, status, price, and creation date.
 * Each row links to the core Medusa product detail page.
 */
const DigitalProductsPage = () => {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  const fetchDigitalProducts = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch("/admin/products/digital", { credentials: "include" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.message || "Failed to fetch")
      setProducts(data.products || [])
    } catch (error: any) {
      toast.error("Digital Products", { description: error.message || "Failed to load" })
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDigitalProducts()
  }, [fetchDigitalProducts])

  // Filter by search
  const filtered = products.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      p.product_title?.toLowerCase().includes(q) ||
      p.file_name?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q)
    )
  })

  const formatSize = (bytes: number) => {
    if (!bytes) return "—"
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
    <Container className="p-8 flex flex-col gap-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Heading level="h1">Digital Products</Heading>
          <Text className="text-ui-fg-subtle mt-1">
            {products.length} digital product{products.length !== 1 ? "s" : ""} with downloadable assets.
          </Text>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="small" onClick={fetchDigitalProducts} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
          <Button size="small" onClick={() => window.location.href = "/app/products/create-digital"}>
            Add Digital Product
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="max-w-sm">
        <Input
          placeholder="Search by product title or file name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Quick Stats */}
      <div className="flex gap-2 flex-wrap">
        <Badge size="small" color="blue">{filtered.length} shown</Badge>
        <Badge size="small" color="green">
          {filtered.filter((p) => p.product_status === "published").length} published
        </Badge>
        <Badge size="small" color="orange">
          {filtered.filter((p) => p.product_status === "draft").length} draft
        </Badge>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center">
          <Text className="text-ui-fg-subtle">Loading digital products…</Text>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Text className="text-ui-fg-subtle">
            {search ? "No digital products match your search." : "No digital products yet."}
          </Text>
          {!search && (
            <div className="mt-4">
              <Button onClick={() => window.location.href = "/app/products/create-digital"}>
                Create your first digital product
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>File</Table.HeaderCell>
              <Table.HeaderCell>Size</Table.HeaderCell>
              <Table.HeaderCell>Type</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Downloads</Table.HeaderCell>
              <Table.HeaderCell>Created</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {filtered.map((item) => (
              <Table.Row key={item.id}>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    {item.product_thumbnail && (
                      <img
                        src={item.product_thumbnail}
                        alt=""
                        className="w-8 h-8 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <Text size="small" className="font-medium truncate block max-w-[200px]">
                        {item.product_title}
                      </Text>
                      {item.product_handle && (
                        <Text size="small" className="text-ui-fg-subtle truncate max-w-[200px]">
                          /{item.product_handle}
                        </Text>
                      )}
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell className="max-w-[160px] truncate" title={item.file_name}>
                  <Badge size="small" color="blue">{item.file_name || "—"}</Badge>
                </Table.Cell>
                <Table.Cell className="text-xs text-ui-fg-subtle font-mono">
                  {formatSize(item.file_size)}
                </Table.Cell>
                <Table.Cell className="text-xs text-ui-fg-subtle">
                  {(item.mime_type || "").split("/").pop() || "—"}
                </Table.Cell>
                <Table.Cell>
                  <StatusBadge color={item.product_status === "published" ? "green" : "orange"}>
                    {item.product_status || "draft"}
                  </StatusBadge>
                </Table.Cell>
                <Table.Cell className="text-xs text-ui-fg-subtle font-mono">
                  {item.download_count || 0} / {item.download_limit || "∞"}
                </Table.Cell>
                <Table.Cell className="text-xs text-ui-fg-subtle">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString() : "—"}
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button
                    size="small"
                    variant="secondary"
                    onClick={() => window.open(`/app/products/${item.product_id}`, "_blank")}
                  >
                    Open
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = {
  label: "Digital Products",
  icon: "document-text",
}

export default DigitalProductsPage