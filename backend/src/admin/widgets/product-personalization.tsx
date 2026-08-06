import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Drawer, Heading, Input, Label, Select, Switch, Text, Textarea, toast } from "@medusajs/ui"
import { useCallback, useEffect, useState } from "react"
import {
  apiErrorMessage,
  draftFromTemplate,
  fieldCountOf,
  formatUpdatedAt,
  lifecycleOf,
  newPersonalizationField,
  syncPurchaseModeToggles,
  templateDraftPayload,
  validateTemplateDraft,
  type PersonalizationTemplate,
  type TemplateDraft,
} from "../lib/personalization-admin"
import { CustomerFormPreview, FieldEditor } from "../routes/personalized-products/components"

const emptyDraftForProduct = (product: any): TemplateDraft => ({
  title: `${product?.title || "Product"} Personalization`,
  description: "",
  product_id: String(product?.id || ""),
  variant_id: "",
  allow_normal_purchase: true,
  personalization_required: false,
  fields: [newPersonalizationField("Custom Text")],
})

const lifecycleColor = (status: ReturnType<typeof lifecycleOf>) => {
  if (status === "active") return "green" as const
  if (status === "archived") return "grey" as const
  return "orange" as const
}

const ProductPersonalizationWidget = (props: any) => {
  // Medusa detail widgets provide the current resource through `data`; the
  // fallback keeps isolated tests and older Admin loaders compatible.
  const product = props.data ?? props.product
  const [template, setTemplate] = useState<PersonalizationTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "mobile">("desktop")
  const [draft, setDraft] = useState<TemplateDraft>(() => emptyDraftForProduct(product))

  const load = useCallback(async () => {
    if (!product?.id) return
    setLoading(true)
    try {
      const response = await fetch(`/admin/products/${product.id}/personalization`, { credentials: "include" })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to load personalization"))
      setTemplate(body.template || null)
    } catch (error: any) {
      toast.error("Personalization", { description: error.message })
    } finally {
      setLoading(false)
    }
  }, [product?.id])

  useEffect(() => { void load() }, [load])

  const openEditor = () => {
    setDraft(template ? draftFromTemplate(template) : emptyDraftForProduct(product))
    setEditorOpen(true)
  }

  const save = async () => {
    const issues = validateTemplateDraft(draft)
    if (issues.length) {
      toast.error("Template is incomplete", { description: `${issues[0].code}: ${issues[0].message}` })
      return
    }
    setSaving(true)
    try {
      const activeEdit = template ? lifecycleOf(template) === "active" : false
      const response = await fetch(template ? `/admin/personalization-templates/${template.id}` : "/admin/personalization-templates", {
        method: template ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...templateDraftPayload(draft),
          ...(template ? {
            expected_version: Number(template.version || 1),
            expected_updated_at: template.updated_at || undefined,
            create_new_version: activeEdit,
            is_active: false,
          } : {}),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to save personalization"))
      toast.success(activeEdit ? "A new Draft version was created; the active historical version was preserved" : template ? "Draft personalization updated" : "Draft personalization created")
      setEditorOpen(false)
      await load()
    } catch (error: any) {
      toast.error("Personalization save failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const setActive = async (isActive: boolean) => {
    if (!template) return
    if (isActive) {
      const issues = validateTemplateDraft(draftFromTemplate(template))
      if (issues.length) {
        toast.error("Activation blocked", { description: `${issues[0].code}: ${issues[0].message}` })
        return
      }
    }
    setSaving(true)
    try {
      const response = await fetch(`/admin/personalization-templates/${template.id}/status`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: isActive, expected_version: Number(template.version || 1) }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, `Unable to ${isActive ? "activate" : "disable"} personalization`))
      toast.success(isActive ? "Personalization activated" : "Personalization disabled and returned to Draft")
      await load()
    } catch (error: any) {
      toast.error(isActive ? "Activation blocked" : "Disable failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const archive = async () => {
    if (!template || lifecycleOf(template) === "archived") return
    const approved = window.confirm(`Archive “${template.title}”? Historical cart and order personalization snapshots remain unchanged.`)
    if (!approved) return
    setSaving(true)
    try {
      const response = await fetch(`/admin/personalization-templates/${template.id}/archive`, { method: "POST", credentials: "include" })
      const body = await response.json()
      if (!response.ok) throw new Error(apiErrorMessage(body, "Unable to archive personalization"))
      toast.success("Personalization archived; historical snapshots were preserved")
      await load()
    } catch (error: any) {
      toast.error("Archive failed", { description: error.message })
    } finally {
      setSaving(false)
    }
  }

  const status = template ? lifecycleOf(template) : "draft"
  const selectedVariant = template?.variant_id
    ? (product?.variants || []).find((variant: any) => variant.id === template.variant_id)
    : null

  // Development trace: [PRODUCT_DETAIL_PERSONALIZATION_DRAFT]
  // Logs the current product binding so QA can verify the payload always
  // includes the currently opened product ID (Phase 4 contract).
  if (typeof window !== "undefined" && (window as any).__PERSONALIZATION_DEBUG__) {
    const purchaseMode = draft.personalization_required ? "REQUIRED_PERSONALIZATION" : "OPTIONAL_PERSONALIZATION"
    const payloadValid = validateTemplateDraft(draft).length === 0
    console.info("[PRODUCT_DETAIL_PERSONALIZATION_DRAFT]", {
      productId: String(product?.id || ""),
      productTitle: String(product?.title || ""),
      variantId: draft.variant_id || null,
      purchaseMode,
      fieldCount: draft.fields.length,
      payloadValid,
    })
  }

  return <Container className="p-6">
    <div className="flex items-start justify-between gap-4">
      <div><Heading level="h2">Personalization</Heading><Text size="small" className="text-ui-fg-subtle">Configure customer-supplied options without creating a second product.</Text></div>
      <Badge color={template && status === "active" ? "green" : "grey"}>{template && status === "active" ? "Enabled" : "Disabled"}</Badge>
    </div>

    {loading ? <Text className="mt-4 text-ui-fg-subtle">Loading personalization…</Text> : !template ? <div className="mt-5 rounded-lg border border-ui-border-base p-4">
      <Text>Personalization is not configured for this product.</Text>
      <Text size="small" className="mt-1 text-ui-fg-subtle">Create a Draft, preview the customer form, then activate after validation.</Text>
      <Button className="mt-3" size="small" onClick={openEditor}>Create Draft</Button>
    </div> : <div className="mt-5 rounded-lg border border-ui-border-base p-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div><Text size="xsmall" className="text-ui-fg-subtle">Attached template</Text><Text weight="plus">{template.title}</Text><Text size="xsmall" className="text-ui-fg-subtle">{template.id}</Text></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Scope</Text><Text weight="plus">{template.variant_id ? (selectedVariant?.title || selectedVariant?.sku || "Selected variant") : "All variants"}</Text>{template.variant_id && <Text size="xsmall" className="text-ui-fg-subtle">{template.variant_id}</Text>}</div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Status</Text><Badge color={lifecycleColor(status)}>{status.toUpperCase()}</Badge></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Fields</Text><Text>{fieldCountOf(template)}</Text></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Version</Text><Text>{Number(template.version || 1)}</Text></div>
        <div><Text size="xsmall" className="text-ui-fg-subtle">Updated</Text><Text>{formatUpdatedAt(template.updated_at)}</Text></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="small" onClick={openEditor} disabled={status === "archived" || saving}>Edit</Button>
        <Button size="small" variant="secondary" disabled={!fieldCountOf(template)} onClick={() => { setPreviewViewport("desktop"); setPreviewOpen(true) }}>Preview</Button>
        {status === "draft" && <Button size="small" disabled={saving || !fieldCountOf(template) || template.fields_valid === false} onClick={() => void setActive(true)}>Activate</Button>}
        {status === "active" && <Button size="small" variant="secondary" disabled={saving} onClick={() => void setActive(false)}>Disable</Button>}
        <Button size="small" variant="danger" disabled={status === "archived" || saving} onClick={() => void archive()}>Archive</Button>
      </div>
    </div>}

    <Drawer open={editorOpen} onOpenChange={setEditorOpen}>
      <Drawer.Content>
        <Drawer.Header><Drawer.Title>{template ? "Edit Personalization" : "Create Personalization Draft"}</Drawer.Title><Drawer.Description>{template && status === "active" ? "Saving creates a new Draft version and preserves the active version." : "Review and preview this Draft before activation."}</Drawer.Description></Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-5 overflow-y-auto">
          <div><Label>Template title</Label><Input value={draft.title} maxLength={120} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></div>
          <div><Label>Description</Label><Textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
          <div><Label>Apply to</Label><Select value={draft.variant_id || "__all_variants__"} onValueChange={(value) => setDraft((current) => ({ ...current, variant_id: value === "__all_variants__" ? "" : value }))}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content><Select.Item value="__all_variants__">All variants</Select.Item>{(product?.variants || []).map((variant: any) => <Select.Item key={variant.id} value={variant.id}>{variant.title || variant.sku || variant.id}</Select.Item>)}</Select.Content></Select></div>
          <div className="flex items-center justify-between"><div><Text weight="plus">Allow normal purchase</Text><Text size="small" className="text-ui-fg-subtle">Customers may purchase without personalization.</Text></div><Switch checked={draft.allow_normal_purchase} onCheckedChange={(checked) => setDraft((current) => ({ ...current, ...syncPurchaseModeToggles(current, { allow_normal_purchase: checked }) }))} /></div>
          <div className="flex items-center justify-between"><div><Text weight="plus">Personalization required</Text><Text size="small" className="text-ui-fg-subtle">Required customer inputs must be supplied.</Text></div><Switch checked={draft.personalization_required} onCheckedChange={(checked) => setDraft((current) => ({ ...current, ...syncPurchaseModeToggles(current, { personalization_required: checked }) }))} /></div>
          <Text size="xsmall" className="text-ui-fg-subtle -mt-2">If normal purchase is allowed, personalization cannot be required. Enabling one disables the other.</Text>
          <FieldEditor fields={draft.fields} onChange={(fields) => setDraft((current) => ({ ...current, fields }))} />
        </Drawer.Body>
        <Drawer.Footer><div className="flex w-full justify-between"><Button variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={saving} onClick={save}>{saving ? "Saving…" : template && status === "active" ? "Save as New Draft Version" : "Save Draft"}</Button></div></Drawer.Footer>
      </Drawer.Content>
    </Drawer>

    <Drawer open={previewOpen} onOpenChange={setPreviewOpen}>
      <Drawer.Content>
        <Drawer.Header><Drawer.Title>Customer Form Preview</Drawer.Title><Drawer.Description>No quote, upload, or cart line is created.</Drawer.Description></Drawer.Header>
        <Drawer.Body className="overflow-y-auto"><div className="mb-4 flex justify-end gap-2"><Button size="small" variant={previewViewport === "desktop" ? "primary" : "secondary"} onClick={() => setPreviewViewport("desktop")}>Desktop</Button><Button size="small" variant={previewViewport === "mobile" ? "primary" : "secondary"} onClick={() => setPreviewViewport("mobile")}>Mobile</Button></div><CustomerFormPreview title={template?.title || draft.title} fields={template ? draftFromTemplate(template).fields : draft.fields} viewport={previewViewport} /></Drawer.Body>
        <Drawer.Footer><Button variant="secondary" onClick={() => setPreviewOpen(false)}>Close preview</Button></Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  </Container>
}

export const config = defineWidgetConfig({ zone: "product.details.after" })
export default ProductPersonalizationWidget