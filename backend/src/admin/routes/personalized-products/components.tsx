import { Button, Checkbox, Heading, Input, Label, Select, Switch, Text, Textarea } from "@medusajs/ui"
import type { PersonalizationFieldDraft } from "../../lib/personalization-admin"
import {
  PERSONALIZATION_FIELD_TYPES,
  PERSONALIZATION_PRESETS,
  newPersonalizationField,
  presetFields,
} from "../../lib/personalization-admin"

type FieldEditorProps = {
  fields: PersonalizationFieldDraft[]
  onChange: (fields: PersonalizationFieldDraft[]) => void
  disabled?: boolean
  showPresets?: boolean
}

const humanize = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase())

export function FieldEditor({ fields, onChange, disabled = false, showPresets = true }: FieldEditorProps) {
  const patchField = (index: number, patch: Partial<PersonalizationFieldDraft>) => {
    onChange(fields.map((item, row) => row === index ? { ...item, ...patch } : item))
  }

  return <div className="flex flex-col gap-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Heading level="h3">Customer fields</Heading>
        <Text size="small" className="text-ui-fg-subtle">Labels, validation, options, surcharge, and display order are editable before activation.</Text>
      </div>
      {showPresets && <div className="min-w-[220px]">
        <Label>Start from a preset</Label>
        <Select onValueChange={(value) => onChange(presetFields(value))} disabled={disabled}>
          <Select.Trigger><Select.Value placeholder="Choose an optional preset" /></Select.Trigger>
          <Select.Content>
            {Object.entries(PERSONALIZATION_PRESETS).map(([value, preset]) => <Select.Item key={value} value={value}>{preset.label}</Select.Item>)}
          </Select.Content>
        </Select>
      </div>}
    </div>

    {fields.map((item, index) => <div key={`${index}-${item.key}`} className="rounded-lg border border-ui-border-base p-4">
      <div className="mb-3 flex items-center justify-between">
        <Text weight="plus">Field {index + 1}</Text>
        <Button type="button" size="small" variant="danger" disabled={disabled || fields.length === 1} onClick={() => onChange(fields.filter((_, row) => row !== index))}>Remove</Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div><Label>Customer-facing label</Label><Input value={item.label} disabled={disabled} onChange={(event) => patchField(index, { label: event.target.value })} placeholder="Name on product" /></div>
        <div><Label>Internal key</Label><Input value={item.key} disabled={disabled} onChange={(event) => patchField(index, { key: event.target.value })} placeholder="Generated from label when blank" /></div>
        <div>
          <Label>Field type</Label>
          <Select
            value={item.field_type}
            disabled={disabled}
            onValueChange={(value) => {
              const patch: Partial<PersonalizationFieldDraft> = { field_type: value }
              // Reset incompatible/stale state values
              if (value === "text" || value === "textarea") {
                patch.min_value = ""
                patch.max_value = ""
                patch.allowed_values = ""
              } else if (value === "number") {
                patch.min_length = ""
                patch.max_length = ""
                patch.allowed_values = ""
              } else if (["select", "radio"].includes(value)) {
                patch.min_length = ""
                patch.max_length = ""
                patch.min_value = ""
                patch.max_value = ""
              } else if (value === "color") {
                patch.min_length = ""
                patch.max_length = ""
                patch.min_value = ""
                patch.max_value = ""
              } else {
                patch.min_length = ""
                patch.max_length = ""
                patch.min_value = ""
                patch.max_value = ""
                patch.allowed_values = ""
              }
              patchField(index, patch)
            }}
          >
            <Select.Trigger><Select.Value /></Select.Trigger>
            <Select.Content>
              {PERSONALIZATION_FIELD_TYPES.map((type) => <Select.Item key={type} value={type}>{humanize(type)}</Select.Item>)}
            </Select.Content>
          </Select>
        </div>
        <div><Label>Placeholder</Label><Input value={item.placeholder} disabled={disabled} onChange={(event) => patchField(index, { placeholder: event.target.value })} /></div>
        <div className="md:col-span-2"><Label>Help text</Label><Input value={item.help_text} disabled={disabled} onChange={(event) => patchField(index, { help_text: event.target.value })} placeholder="Shown below the field" /></div>
        
        {/* Conditional inputs based on field type */}
        {(item.field_type === "text" || item.field_type === "textarea") && (
          <>
            <div><Label>Minimum length</Label><Input type="number" min={0} value={item.min_length} disabled={disabled} onChange={(event) => patchField(index, { min_length: event.target.value })} /></div>
            <div><Label>Maximum length</Label><Input type="number" min={1} value={item.max_length} disabled={disabled} onChange={(event) => patchField(index, { max_length: event.target.value })} /></div>
          </>
        )}
        
        {item.field_type === "number" && (
          <>
            <div><Label>Minimum value</Label><Input type="number" value={item.min_value} disabled={disabled} onChange={(event) => patchField(index, { min_value: event.target.value })} /></div>
            <div><Label>Maximum value</Label><Input type="number" value={item.max_value} disabled={disabled} onChange={(event) => patchField(index, { max_value: event.target.value })} /></div>
          </>
        )}
        
        {["select", "radio"].includes(item.field_type) && (
          <div className="md:col-span-2"><Label>Options (comma separated)</Label><Input value={item.allowed_values} disabled={disabled} onChange={(event) => patchField(index, { allowed_values: event.target.value })} placeholder="Small, Medium, Large" /></div>
        )}
        
        {item.field_type === "color" && (
          <div className="md:col-span-2"><Label>Allowed colors (comma separated, e.g. #ff0000, #00ff00)</Label><Input value={item.allowed_values} disabled={disabled} onChange={(event) => patchField(index, { allowed_values: event.target.value })} placeholder="#ffffff, #000000" /></div>
        )}
        
        {item.field_type === "image_upload" && (
          <>
            <div><Label>Allowed MIME types</Label><Input value={item.allowed_values} disabled={disabled} onChange={(event) => patchField(index, { allowed_values: event.target.value })} placeholder="image/jpeg, image/png, image/webp" /></div>
            <div><Label>Maximum file size (MB)</Label><Input type="number" min={1} defaultValue={5} disabled={disabled} /></div>
          </>
        )}
        
        <div><Label>Surcharge (minor units)</Label><Input type="number" min={0} step={1} value={item.price_adjustment} disabled={disabled} onChange={(event) => patchField(index, { price_adjustment: event.target.value })} /></div>
        <div><Label>Sort order</Label><Input type="number" min={0} step={1} value={item.sort_order} disabled={disabled} onChange={(event) => patchField(index, { sort_order: Number(event.target.value) })} /></div>
        <div className="flex items-center gap-2 md:col-span-2"><Switch checked={item.is_required} disabled={disabled} onCheckedChange={(checked) => patchField(index, { is_required: checked })} /><Text size="small">Required field</Text></div>
      </div>
    </div>)}

    <Button type="button" variant="secondary" disabled={disabled || fields.length >= 25} onClick={() => onChange([...fields, { ...newPersonalizationField("New Field"), sort_order: fields.length }])}>Add field</Button>
  </div>
}

type CustomerFormPreviewProps = {
  title?: string
  fields: PersonalizationFieldDraft[]
  viewport?: "desktop" | "mobile"
}

function PreviewControl({ field }: { field: PersonalizationFieldDraft }) {
  const placeholder = field.placeholder || field.help_text || "Customer response"
  if (field.field_type === "textarea") return <Textarea disabled placeholder={placeholder} maxLength={field.max_length ? Number(field.max_length) : undefined} />
  if (field.field_type === "select") return <Select disabled><Select.Trigger><Select.Value placeholder="Select an option" /></Select.Trigger><Select.Content>{field.allowed_values.split(",").map((value) => value.trim()).filter(Boolean).map((value) => <Select.Item key={value} value={value}>{value}</Select.Item>)}</Select.Content></Select>
  if (field.field_type === "radio") return <div className="flex flex-col gap-2">{field.allowed_values.split(",").map((value) => value.trim()).filter(Boolean).map((value) => <label key={value} className="flex items-center gap-2"><input type="radio" disabled /><Text size="small">{value}</Text></label>)}</div>
  if (["checkbox", "boolean"].includes(field.field_type)) return <div className="flex items-center gap-2"><Checkbox disabled /><Text size="small">Yes</Text></div>
  if (field.field_type === "image_upload") return <Input type="file" disabled accept="image/*" />
  if (field.field_type === "color") return <Input type="color" disabled />
  return <Input
    type={field.field_type === "number" ? "number" : field.field_type === "date" ? "date" : "text"}
    disabled
    placeholder={placeholder}
    minLength={field.min_length ? Number(field.min_length) : undefined}
    maxLength={field.max_length ? Number(field.max_length) : undefined}
    min={field.min_value || undefined}
    max={field.max_value || undefined}
  />
}

export function CustomerFormPreview({ title, fields, viewport = "desktop" }: CustomerFormPreviewProps) {
  const ordered = [...fields].sort((left, right) => Number(left.sort_order) - Number(right.sort_order))
  return <div className={`mx-auto rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-elevation-card-rest ${viewport === "mobile" ? "max-w-[390px]" : "max-w-[760px]"}`} data-testid={`personalization-preview-${viewport}`}>
    <Text size="xsmall" className="text-ui-fg-subtle">Customer form preview · {title || "Untitled template"}</Text>
    <Heading level="h2" className="mt-1">Personalize Your Product</Heading>
    {!ordered.length ? <Text className="mt-4 text-ui-fg-subtle">Add fields to preview the customer form.</Text> : <div className="mt-5 flex flex-col gap-4">
      {ordered.map((item, index) => <div key={`${item.key}-${index}`}>
        <div className="mb-1 flex items-center justify-between gap-3">
          <Label>{item.label || "Incomplete field"}{item.is_required ? " *" : ""}</Label>
          {Number(item.price_adjustment) > 0 && <Text size="xsmall" className="text-ui-fg-interactive">+{Number(item.price_adjustment)} minor units</Text>}
        </div>
        <PreviewControl field={item} />
        {item.help_text && <Text size="xsmall" className="mt-1 text-ui-fg-subtle">{item.help_text}</Text>}
        {item.max_length && <Text size="xsmall" className="mt-1 text-ui-fg-subtle">Maximum {item.max_length} characters</Text>}
      </div>)}
    </div>}
    <Button className="mt-5 w-full" disabled>Preview only — Add Personalized Product</Button>
    <Text size="xsmall" className="mt-2 text-center text-ui-fg-subtle">Preview never creates uploads, quotes, or cart lines.</Text>
  </div>
}
