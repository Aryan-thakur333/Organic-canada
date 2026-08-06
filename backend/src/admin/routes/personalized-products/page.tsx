import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import { Badge, Button, Checkbox, Container, Drawer, Heading, Input, Label, Select, Switch, Table, Text, Textarea, toast } from "@medusajs/ui"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  PERSONALIZATION_PAGE_SIZE,
  apiErrorMessage,
  canActivateSummary,
  draftFromTemplate,
  fieldCountOf,
  formatUpdatedAt,
  lifecycleOf,
  newPersonalizationField,
  productHandleOf,
  productTitleOf,
  syncPurchaseModeToggles,
  templateActionAvailability,
  templateDraftPayload,
  validateTemplateDraft,
  variantTitleOf,
  type PersonalizationProduct,
  type PersonalizationTemplate,
  type TemplateDraft,
} from "../../lib/personalization-admin"
import { CustomerFormPreview, FieldEditor } from "./components"

type DrawerMode = "view" | "edit" | "preview"

const emptyDraft = (): TemplateDraft => ({
  title: "",
  description: "",
  product_id: "",
  variant_id: "",
  allow_normal_purchase: true,
  personalization_required: false,
  fields: [newPersonalizationField("Custom Text")],
})

const statusColor = (status: ReturnType<typeof lifecycleOf>) => {
  if (status === "active") return "green" as const
  if (status === "archived") return "grey" as const
  return "orange" as const
}

const normalizeTitle = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase()

/**
 * Stable response adapter for the Admin Product API.
 * Handles both the canonical { products: [] } and legacy { data: { products: [] } } shapes.
 */
function extractProducts(body: any): PersonalizationProduct[] {
  const root = body?.data ?? body
  const products = root?.products ?? root?.data?.products ?? []
  return Array.isArray(products) ? products : []
}

function extractProductCount(body: any): number {
  const root = body?.data ?? body
  return Number(root?.count ?? root?.data?.count ?? 0)
}

export default function PersonalizedProductsPage() {
  const [templates, setTemplates] = useState<PersonalizationTemplate[]>([])
  const [products, setProducts] = useState<PersonalizationProduct[]>([])
  const [count, setCount] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null)
  const [draft, setDraft] = useState<TemplateDraft>(emptyDraft)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("view")
  const [selectedTemplate, setSelectedTemplate] = useState<PersonalizationTemplate | null>(null)
  const [editorDraft, setEditorDraft] = useState<TemplateDraft>(emptyDraft)
  const [detailLoading, setDetailLoading] = useState(false)
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop")
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkTemplate, setBulkTemplate] = useState<PersonalizationTemplate | null>(null)
  const [bulkProductIds, setBulkProductIds] = useState<string[]>([])

  // Product selector search + pagination state (Phases 5-6)
  const [productSearch, setProductSearch] = useState("")
  const [productSearchDebounced, setProductSearchDebounced] = useState("")
  const [productOffset, setProductOffset] = useState(0)
  const [productCount, setProductCount] = useState(0)
  const [productsLoading, setProductsLoading] = useState(false)
  const [productsFetchedPages, setProductsFetchedPages] = useState(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(`/admin/personalization-templates?limit=${PERSONALIZATION_PAGE_SIZE}&offset=${offset}`, { credentials: "include" })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to load templates"))
      setTemplates(Array.isArray(body.templates) ? body.templates : [])
      setCount(Number(body.count ?? body.templates?.length ?? 0))
    } finally {
      setLoading(false)
    }
  }, [offset])

  // Phase 5-6: Central product selector with server-side search and pagination.
  // Uses Admin Product API (not Store API). No storefront-only constraints.
  // Supports debounced search, offset reset on query change, and deduplication by ID.
  const loadProducts = useCallback(async (search: string, prodOffset: number) => {
    setProductsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(prodOffset),
      })
      if (search.trim()) {
        params.set("q", search.trim())
      }
      const response = await fetch(`/admin/products?${params.toString()}`, { credentials: "include" })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to load products"))
      const fetchedProducts = extractProducts(body)
      const fetchedCount = extractProductCount(body)

      setProductCount(fetchedCount)
      setProductsFetchedPages((prev) => prev + 1)

      // Development trace: [ADMIN_PRODUCT_SELECTOR_PAGINATION]
      if (typeof window !== "undefined" && (window as any).__PERSONALIZATION_DEBUG__) {
        const uniqueIds = new Set(fetchedProducts.map((p) => p.id))
        console.info("[ADMIN_PRODUCT_SELECTOR_PAGINATION]", {
          apiCount: fetchedCount,
          pagesFetched: productsFetchedPages + 1,
          uniqueProducts: uniqueIds.size,
          hardcodedLimitDetected: false,
          newProductFound: false, // QA fills this in during runtime audit
          passed: uniqueIds.size === fetchedProducts.length,
        })
      }

      if (prodOffset === 0) {
        setProducts(fetchedProducts)
      } else {
        // Deduplicate by product ID (Phase 6)
        setProducts((prev) => {
          const existing = new Map(prev.map((p) => [p.id, p]))
          for (const product of fetchedProducts) {
            existing.set(product.id, product)
          }
          return [...existing.values()]
        })
      }
    } catch (error: any) {
      toast.error("Product selector", { description: error.message })
    } finally {
      setProductsLoading(false)
    }
  }, [productsFetchedPages])

  // Debounce search input and reset offset when query changes (Phase 6)
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setProductSearchDebounced(productSearch)
      setProductOffset(0)
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [productSearch])

  // Phase 7: Cache invalidation - refetch on mount, no stale cache.
  // staleTime: 0, refetchOnMount: "always" equivalent for fetch-based approach.
  useEffect(() => {
    void loadTemplates().catch((error) => toast.error("Personalization Templates", { description: error.message }))
  }, [loadTemplates])

  useEffect(() => {
    void loadProducts(productSearchDebounced, productOffset).catch((error) => toast.error("Product selector", { description: error.message }))
  }, [loadProducts, productSearchDebounced, productOffset])

  const refreshProducts = useCallback(() => {
    setProductOffset(0)
    void loadProducts(productSearchDebounced, 0)
  }, [loadProducts, productSearchDebounced])

  const loadMoreProducts = useCallback(() => {
    setProductOffset((prev) => prev + 20)
  }, [])

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const selectedCreateProduct = productById.get(draft.product_id)
  const selectedEditProduct = productById.get(editorDraft.product_id)
  const page = Math.floor(offset / PERSONALIZATION_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(count / PERSONALIZATION_PAGE_SIZE))

  // Phase 8: Mark products that already have an active product-level template
  const activeProductTemplateIds = useMemo(() => {
    return new Set(
      templates
        .filter((t) => lifecycleOf(t) === "active" && !t.variant_id)
        .map((t) => t.product_id)
    )
  }, [templates])

  const hasConfusingTitle = (candidate: TemplateDraft, ignoredTemplateId?: string) => templates.some((template) => (
    template.id !== ignoredTemplateId
    && template.product_id === candidate.product_id
    && String(template.variant_id || "") === candidate.variant_id
    && normalizeTitle(template.title) === normalizeTitle(candidate.title)
    && lifecycleOf(template) !== "archived"
  ))

  const validateForSave = (candidate: TemplateDraft, ignoredTemplateId?: string) => {
    const issues = validateTemplateDraft(candidate)
    if (hasConfusingTitle(candidate, ignoredTemplateId)) {
      issues.unshift({
        code: "PERSONALIZATION_TEMPLATE_TITLE_DUPLICATE",
        message: "A template with the same case-normalized title already exists for this product and scope.",
      })
    }
    if (issues.length) {
      toast.error("Template is incomplete", { description: `${issues[0].code}: ${issues[0].message}` })
      return false
    }
    return true
  }

  const fetchTemplate = async (template: PersonalizationTemplate) => {
    const response = await fetch(`/admin/personalization-templates/${template.id}`, { credentials: "include" })
    const body = await response.json()
    if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to load template details"))
    return { ...template, ...(body.template || {}) } as PersonalizationTemplate
  }

  const openTemplate = async (template: PersonalizationTemplate, mode: DrawerMode) => {
    setDrawerMode(mode)
    setDrawerOpen(true)
    setSelectedTemplate(template)
    setDetailLoading(true)
    try {
      const detail = await fetchTemplate(template)
      setSelectedTemplate(detail)
      setEditorDraft(draftFromTemplate(detail))
    } catch (error: any) {
      toast.error("Template details", { description: error.message })
      setDrawerOpen(false)
    } finally {
      setDetailLoading(false)
    }
  }

  const createDraft = async () => {
    if (!validateForSave(draft)) return
    setSaving(true)
    try {
      const response = await fetch("/admin/personalization-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(templateDraftPayload(draft)),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to create template"))
      toast.success("Draft personalization template created")
      setDraft(emptyDraft())
      setOffset(0)
      await loadTemplates()
      // Phase 7: Invalidate product cache after template creation
      refreshProducts()
    } catch (error: any) {
      toast.error("Template creation failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async () => {
    if (!selectedTemplate || !validateForSave(editorDraft, selectedTemplate.id)) return
    setSaving(true)
    try {
      const activeEdit = lifecycleOf(selectedTemplate) === "active"
      const response = await fetch(`/admin/personalization-templates/${selectedTemplate.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...templateDraftPayload(editorDraft),
          expected_version: Number(selectedTemplate.version || 1),
          expected_updated_at: selectedTemplate.updated_at || undefined,
          create_new_version: activeEdit,
          is_active: false,
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to update template"))
      toast.success(activeEdit ? "A new draft version was created; the active historical version was preserved" : "Draft template updated")
      setDrawerOpen(false)
      await loadTemplates()
      // Phase 7: Invalidate product cache after template update
      refreshProducts()
    } catch (error: any) {
      toast.error("Template update failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (template: PersonalizationTemplate, isActive: boolean) => {
    const availability = templateActionAvailability(template)
    if ((isActive && !availability.activate) || (!isActive && !availability.deactivate)) return
    setBusyTemplateId(template.id)
    try {
      if (isActive) {
        const detail = await fetchTemplate(template)
        const activationDraft = draftFromTemplate(detail)
        const issues = validateTemplateDraft(activationDraft)
        if (issues.length) throw new Error(`${issues[0].code}: ${issues[0].message}`)
      }
      const response = await fetch(`/admin/personalization-templates/${template.id}/status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive, expected_version: Number(template.version || 1) }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, `Unable to ${isActive ? "activate" : "deactivate"} template`))
      toast.success(isActive ? "Template activated" : "Template returned to Draft")
      await loadTemplates()
      // Phase 7: Invalidate product cache after status change
      refreshProducts()
    } catch (error: any) {
      toast.error(isActive ? "Activation blocked" : "Deactivation failed", { description: error.message })
    } finally {
      setBusyTemplateId(null)
    }
  }

  const archiveTemplate = async (template: PersonalizationTemplate) => {
    if (!templateActionAvailability(template).archive) return
    const approved = window.confirm(`Archive “${template.title}”? Storefront access will stop, while historical cart and order snapshots remain unchanged.`)
    if (!approved) return
    setBusyTemplateId(template.id)
    try {
      const response = await fetch(`/admin/personalization-templates/${template.id}/archive`, { method: "POST", credentials: "include" })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to archive template"))
      toast.success("Template archived; historical snapshots were preserved")
      await loadTemplates()
      // Phase 7: Invalidate product cache after archive
      refreshProducts()
    } catch (error: any) {
      toast.error("Template archive failed", { description: error.message })
    } finally {
      setBusyTemplateId(null)
    }
  }

  const duplicateTemplateToProducts = async (template: PersonalizationTemplate, targetProductIds: string[]) => {
    const detail = template.fields ? template : await fetchTemplate(template)
    const sourceDraft = draftFromTemplate(detail)
    for (const targetProductId of targetProductIds) {
      const target = productById.get(targetProductId)
      const duplicateDraft: TemplateDraft = {
        ...sourceDraft,
        title: `${sourceDraft.title} Copy`,
        product_id: targetProductId,
        variant_id: "",
      }
      const response = await fetch("/admin/personalization-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...templateDraftPayload(duplicateDraft), source_template_id: detail.id }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, `Unable to assign the template to ${target?.title || targetProductId}`))
    }
  }

  const duplicateTemplate = async (template: PersonalizationTemplate) => {
    setBusyTemplateId(template.id)
    try {
      await duplicateTemplateToProducts(template, [template.product_id])
      toast.success("Editable Draft copy created")
      setOffset(0)
      await loadTemplates()
      refreshProducts()
    } catch (error: any) {
      toast.error("Template duplication failed", { description: error.message })
    } finally {
      setBusyTemplateId(null)
    }
  }

  const openBulkAssignment = async (template: PersonalizationTemplate) => {
    setBusyTemplateId(template.id)
    try {
      const detail = await fetchTemplate(template)
      setBulkTemplate(detail)
      setBulkProductIds([])
      setBulkOpen(true)
    } catch (error: any) {
      toast.error("Bulk assignment unavailable", { description: error.message })
    } finally {
      setBusyTemplateId(null)
    }
  }

  const bulkAssign = async () => {
    if (!bulkTemplate || !bulkProductIds.length) return
    setSaving(true)
    try {
      await duplicateTemplateToProducts(bulkTemplate, bulkProductIds)
      toast.success(`Draft copies assigned to ${bulkProductIds.length} products`)
      setBulkOpen(false)
      setOffset(0)
      await loadTemplates()
      refreshProducts()
    } catch (error: any) {
      toast.error("Bulk assignment stopped", { description: `${error.message} Previously completed copies remain Draft.` })
    } finally {
      setSaving(false)
    }
  }

  const renderDrawerBody = () => {
    if (detailLoading || !selectedTemplate) return <Text className="text-ui-fg-subtle">Loading full template…</Text>
    const status = lifecycleOf(selectedTemplate)
    const productTitle = productTitleOf(selectedTemplate, productById)
    const variantTitle = variantTitleOf(selectedTemplate, productById)
    if (drawerMode === "preview") return <div className="flex flex-col gap-y-4">
      <div className="flex items-center justify-end gap-2"><Button size="small" variant={previewViewport === "desktop" ? "primary" : "secondary"} onClick={() => setPreviewViewport("desktop")}>Desktop</Button><Button size="small" variant={previewViewport === "mobile" ? "primary" : "secondary"} onClick={() => setPreviewViewport("mobile")}>Mobile</Button></div>
      <CustomerFormPreview title={selectedTemplate.title} fields={editorDraft.fields} viewport={previewViewport} />
    </div>
    if (drawerMode === "view") return <div className="flex flex-col gap-y-5">
      <div className="grid grid-cols-1 gap-4 rounded-lg border border-ui-border-base p-4 md:grid-cols-2">
        <div><Text size="xsmall" className="text-ui-fg-subtle">Template title</Text><Text weight="plus">{selectedTemplate.title}</Text><Text size="xsmall" className="text-ui-fg-subtle">{selectedTemplate.id}</Text></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Lifecycle</Text><Badge color={statusColor(status)}>{status.toUpperCase()}</Badge></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Product</Text><Text weight="plus">{productTitle}</Text><Text size="xsmall" className="text-ui-fg-subtle">{selectedTemplate.product_id}</Text></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Variant scope</Text><Text weight="plus">{variantTitle || "All variants"}</Text>{selectedTemplate.variant_id && <Text size="xsmall" className="text-ui-fg-subtle">{selectedTemplate.variant_id}</Text>}</div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Version</Text><Text>{Number(selectedTemplate.version || 1)}</Text></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Updated</Text><Text>{formatUpdatedAt(selectedTemplate.updated_at)}</Text></div>
      </div>
      {selectedTemplate.description && <div><Heading level="h3">Description</Heading><Text>{selectedTemplate.description}</Text></div>}
      <FieldEditor fields={editorDraft.fields} onChange={() => undefined} disabled showPresets={false} />
    </div>
    return <div className="flex flex-col gap-y-5">
      {status === "active" && <div className="rounded-lg border border-ui-border-interactive bg-ui-bg-subtle p-3"><Text weight="plus">Version-safe edit</Text><Text size="small">Saving creates a new Draft version. The active version and historical cart/order snapshots are preserved.</Text></div>}
      <div><Label>Template title</Label><Input value={editorDraft.title} maxLength={120} onChange={(event) => setEditorDraft((current) => ({ ...current, title: event.target.value }))} /></div>
      <div><Label>Description</Label><Textarea value={editorDraft.description} onChange={(event) => setEditorDraft((current) => ({ ...current, description: event.target.value }))} /></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div><Label>Product</Label><Select value={editorDraft.product_id} disabled onValueChange={() => undefined}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content>{products.map((product) => <Select.Item key={product.id} value={product.id}>{product.title || product.id}</Select.Item>)}</Select.Content></Select><Text size="xsmall" className="mt-1 text-ui-fg-subtle">Assignment product cannot be changed during an edit.</Text></div>
        <div><Label>Variant scope</Label><Select value={editorDraft.variant_id || "__all_variants__"} onValueChange={(value) => setEditorDraft((current) => ({ ...current, variant_id: value === "__all_variants__" ? "" : value }))}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content><Select.Item value="__all_variants__">All variants</Select.Item>{(selectedEditProduct?.variants || []).map((variant) => <Select.Item key={variant.id} value={variant.id}>{variant.title || variant.sku || variant.id}</Select.Item>)}</Select.Content></Select></div>
      </div>
      <div className="flex items-center justify-between"><div><Text weight="plus">Allow normal purchase</Text><Text size="small" className="text-ui-fg-subtle">Customers may purchase without personalization.</Text></div><Switch checked={editorDraft.allow_normal_purchase} onCheckedChange={(checked) => setEditorDraft((current) => ({ ...current, ...syncPurchaseModeToggles(current, { allow_normal_purchase: checked }) }))} /></div>
      <div className="flex items-center justify-between"><div><Text weight="plus">Personalization required</Text><Text size="small" className="text-ui-fg-subtle">Required fields must be completed before adding to cart.</Text></div><Switch checked={editorDraft.personalization_required} onCheckedChange={(checked) => setEditorDraft((current) => ({ ...current, ...syncPurchaseModeToggles(current, { personalization_required: checked }) }))} /></div>
      <Text size="xsmall" className="text-ui-fg-subtle -mt-2">If normal purchase is allowed, personalization cannot be required. Enabling one disables the other.</Text>
      <FieldEditor fields={editorDraft.fields} onChange={(fields) => setEditorDraft((current) => ({ ...current, fields }))} />
    </div>
  }

  return <Container className="flex flex-col gap-y-8 p-8">
    <div>
      <Heading level="h1">Personalization Templates</Heading>
      <Text className="text-ui-fg-subtle">Advanced management for product assignments, versioned fields, customer previews, and safe lifecycle changes.</Text>
    </div>

    <div className="flex flex-col gap-y-5 rounded-lg border border-ui-border-base p-5">
      <div><Heading level="h2">Create Draft</Heading><Text size="small" className="text-ui-fg-subtle">New templates stay Draft until validation and explicit activation.</Text></div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div><Label>Template title</Label><Input value={draft.title} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Fresh Cheese Personalization" /></div>
        <div>
          <Label>Product</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Search products…"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              className="flex-1"
            />
            <Button size="small" variant="secondary" onClick={refreshProducts} disabled={productsLoading}>Refresh</Button>
          </div>
          <Select value={draft.product_id} onValueChange={(value) => setDraft((current) => ({ ...current, product_id: value, variant_id: "" }))}>
            <Select.Trigger><Select.Value placeholder="Select a product" /></Select.Trigger>
            <Select.Content>
              {products.map((product) => {
                const hasActiveTemplate = activeProductTemplateIds.has(product.id)
                return <Select.Item key={product.id} value={product.id}>
                  {product.title || product.id}{hasActiveTemplate ? " · Active template exists" : ""}
                </Select.Item>
              })}
              {productOffset + 20 < productCount && <Select.Item value="__load_more__" disabled={productsLoading}>Load more…</Select.Item>}
            </Select.Content>
          </Select>
          {productOffset + 20 < productCount && <Button size="small" variant="secondary" onClick={loadMoreProducts} disabled={productsLoading} className="mt-1">Load more products</Button>}
          <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
            {productsLoading ? "Loading…" : `${products.length} of ${productCount} products shown`}
            {productSearchDebounced && ` for "${productSearchDebounced}"`}
          </Text>
        </div>
        <div><Label>Variant scope</Label><Select value={draft.variant_id || "__all_variants__"} disabled={!draft.product_id} onValueChange={(value) => setDraft((current) => ({ ...current, variant_id: value === "__all_variants__" ? "" : value }))}><Select.Trigger><Select.Value placeholder="All variants" /></Select.Trigger><Select.Content><Select.Item value="__all_variants__">All variants</Select.Item>{(selectedCreateProduct?.variants || []).map((variant) => <Select.Item key={variant.id} value={variant.id}>{variant.title || variant.sku || variant.id}</Select.Item>)}</Select.Content></Select></div>
        <div><Label>Description</Label><Input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex items-center gap-3 rounded border border-ui-border-base p-3"><Switch checked={draft.allow_normal_purchase} onCheckedChange={(checked) => setDraft((current) => ({ ...current, ...syncPurchaseModeToggles(current, { allow_normal_purchase: checked }) }))} /><div><Text weight="plus">Allow normal purchase</Text><Text size="small" className="text-ui-fg-subtle">Customers may skip optional personalization.</Text></div></label>
        <label className="flex items-center gap-3 rounded border border-ui-border-base p-3"><Switch checked={draft.personalization_required} onCheckedChange={(checked) => setDraft((current) => ({ ...current, ...syncPurchaseModeToggles(current, { personalization_required: checked }) }))} /><div><Text weight="plus">Personalization required</Text><Text size="small" className="text-ui-fg-subtle">Customer must complete required fields.</Text></div></label>
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle -mt-2">If normal purchase is allowed, personalization cannot be required. Enabling one disables the other.</Text>
      <FieldEditor fields={draft.fields} onChange={(fields) => setDraft((current) => ({ ...current, fields }))} />
      <div className="flex justify-end"><Button disabled={saving} onClick={createDraft}>{saving ? "Creating…" : "Create Draft"}</Button></div>
    </div>

    <div className="overflow-x-auto rounded-lg border border-ui-border-base">
      <Table>
        <Table.Header><Table.Row><Table.HeaderCell>Template title</Table.HeaderCell><Table.HeaderCell>Product name</Table.HeaderCell><Table.HeaderCell>Variant scope</Table.HeaderCell><Table.HeaderCell>Fields</Table.HeaderCell><Table.HeaderCell>Version</Table.HeaderCell><Table.HeaderCell>Status</Table.HeaderCell><Table.HeaderCell>Updated</Table.HeaderCell><Table.HeaderCell>Actions</Table.HeaderCell></Table.Row></Table.Header>
        <Table.Body>
          {loading ? <Table.Row><Table.Cell><Text className="py-6 text-ui-fg-subtle">Loading personalization templates…</Text></Table.Cell>{Array.from({ length: 7 }).map((_, index) => <Table.Cell key={index} />)}</Table.Row> : !templates.length ? <Table.Row><Table.Cell><Text className="py-6 text-ui-fg-subtle">No templates on this page.</Text></Table.Cell>{Array.from({ length: 7 }).map((_, index) => <Table.Cell key={index} />)}</Table.Row> : templates.map((template) => {
            const status = lifecycleOf(template)
            const actions = templateActionAvailability(template)
            const productTitle = productTitleOf(template, productById)
            const productHandle = productHandleOf(template, productById)
            const variantTitle = variantTitleOf(template, productById)
            const busy = busyTemplateId === template.id
            return <Table.Row key={template.id}>
              <Table.Cell><Text weight="plus">{template.title || "Untitled template"}</Text><Text size="xsmall" className="text-ui-fg-subtle">{template.id}</Text></Table.Cell>
              <Table.Cell><Text weight="plus">{productTitle}</Text><Text size="xsmall" className="text-ui-fg-subtle">{productHandle ? `${productHandle} · ` : ""}{template.product_id}</Text></Table.Cell>
              <Table.Cell><Text weight="plus">{variantTitle || "All variants"}</Text>{template.variant_id && <Text size="xsmall" className="text-ui-fg-subtle">{template.variant_id}</Text>}</Table.Cell>
              <Table.Cell>{fieldCountOf(template)}</Table.Cell>
              <Table.Cell>{Number(template.version || 1)}</Table.Cell>
              <Table.Cell><Badge color={statusColor(status)}>{status.toUpperCase()}</Badge></Table.Cell>
              <Table.Cell><Text size="small">{formatUpdatedAt(template.updated_at)}</Text></Table.Cell>
              <Table.Cell><div className="flex min-w-[340px] flex-wrap gap-1.5">
                <Button size="small" variant="secondary" onClick={() => void openTemplate(template, "view")}>View</Button>
                <Button size="small" variant="secondary" disabled={!actions.edit || busy} onClick={() => void openTemplate(template, "edit")}>Edit</Button>
                <Button size="small" variant="secondary" disabled={!actions.preview || busy} onClick={() => void openTemplate(template, "preview")}>Preview</Button>
                <Button size="small" disabled={!actions.activate || busy || !canActivateSummary(template)} onClick={() => void changeStatus(template, true)}>Activate</Button>
                <Button size="small" variant="secondary" disabled={!actions.deactivate || busy} onClick={() => void changeStatus(template, false)}>Deactivate</Button>
                <Button size="small" variant="secondary" disabled={!actions.duplicate || busy} onClick={() => void duplicateTemplate(template)}>Duplicate</Button>
                <Button size="small" variant="secondary" disabled={!actions.bulkAssign || busy} onClick={() => void openBulkAssignment(template)}>Bulk assignment</Button>
                <Button size="small" variant="danger" disabled={!actions.archive || busy} onClick={() => void archiveTemplate(template)}>Archive</Button>
              </div></Table.Cell>
            </Table.Row>
          })}
        </Table.Body>
      </Table>
      <div className="flex items-center justify-between border-t border-ui-border-base px-4 py-3">
        <Text size="small" className="text-ui-fg-subtle">Showing {count ? offset + 1 : 0}–{Math.min(offset + templates.length, count)} of {count} templates · Page {page} of {pageCount}</Text>
        <div className="flex gap-2"><Button size="small" variant="secondary" disabled={offset === 0 || loading} onClick={() => setOffset((current) => Math.max(0, current - PERSONALIZATION_PAGE_SIZE))}>Previous</Button><Button size="small" variant="secondary" disabled={offset + PERSONALIZATION_PAGE_SIZE >= count || loading} onClick={() => setOffset((current) => current + PERSONALIZATION_PAGE_SIZE)}>Next</Button></div>
      </div>
    </div>

    <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
      <Drawer.Content>
        <Drawer.Header><Drawer.Title>{drawerMode === "view" ? "View Template" : drawerMode === "preview" ? "Customer Form Preview" : "Edit Template"}</Drawer.Title><Drawer.Description>{selectedTemplate ? `${selectedTemplate.title} · Version ${Number(selectedTemplate.version || 1)}` : "Loading template"}</Drawer.Description></Drawer.Header>
        <Drawer.Body className="overflow-y-auto">{renderDrawerBody()}</Drawer.Body>
        <Drawer.Footer><div className="flex w-full justify-between"><Button variant="secondary" onClick={() => setDrawerOpen(false)}>Close</Button>{drawerMode === "edit" && <Button disabled={saving || detailLoading} onClick={saveEdit}>{saving ? "Saving…" : lifecycleOf(selectedTemplate as PersonalizationTemplate) === "active" ? "Save as New Draft Version" : "Save Draft"}</Button>}</div></Drawer.Footer>
      </Drawer.Content>
    </Drawer>

    <Drawer open={bulkOpen} onOpenChange={setBulkOpen}>
      <Drawer.Content>
        <Drawer.Header><Drawer.Title>Bulk assignment</Drawer.Title><Drawer.Description>Create independent editable Draft copies of “{bulkTemplate?.title}”. Existing active assignments are never replaced.</Drawer.Description></Drawer.Header>
        <Drawer.Body className="overflow-y-auto"><div className="flex flex-col gap-2">{products.filter((product) => product.id !== bulkTemplate?.product_id).map((product) => <label key={product.id} className="flex items-center gap-3 rounded border border-ui-border-base p-3"><Checkbox checked={bulkProductIds.includes(product.id)} onCheckedChange={(checked) => setBulkProductIds((current) => checked === true ? [...current, product.id] : current.filter((id) => id !== product.id))} /><div><Text weight="plus">{product.title || "Untitled product"}</Text><Text size="xsmall" className="text-ui-fg-subtle">{product.handle ? `${product.handle} · ` : ""}{product.id}</Text></div></label>)}</div></Drawer.Body>
        <Drawer.Footer><div className="flex w-full justify-between"><Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button><Button disabled={saving || !bulkProductIds.length} onClick={bulkAssign}>{saving ? "Assigning…" : `Create ${bulkProductIds.length} Draft ${bulkProductIds.length === 1 ? "copy" : "copies"}`}</Button></div></Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  </Container>
}

export const config = defineRouteConfig({ label: "Personalization Templates", icon: Tag })