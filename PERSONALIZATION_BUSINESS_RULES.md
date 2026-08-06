# Personalization Business Rules

## Pricing and money

- All prices and personalization adjustments are integer minor units. No route accepts a client price or surcharge.
- The quote and add-to-cart paths load Medusa's calculated variant price with the requested/cart region context.
- The add-to-cart path recalculates the quote under a cart lock. A prior quote is informational, never trusted.
- A boolean/checkbox adjustment applies only when its normalized value is `true`. Other field adjustments apply only when a value is supplied.

## Templates and fields

- An active variant template takes precedence over an active product-wide template.
- Published template edits create a new version/schema hash. Cart and order records retain immutable template snapshots.
- Template deletion from vendor tools archives/deactivates the template.
- Maximum fields: 25. Maximum text length: 5,000 characters.
- Field keys are lowercase identifier strings up to 64 characters and unique within a template.
- Supported production field types: text, textarea, select, color, number, boolean and image upload. Legacy date/radio/checkbox types remain readable for compatibility.

## Images

- Customer authentication is required to upload or read a customer preview.
- Allowed formats are JPEG, PNG and WebP; SVG and executable extensions are rejected.
- Maximum encoded image size is 5 MiB and maximum dimensions are 8,000 x 8,000 pixels.
- The server decodes content with Sharp and verifies the decoded format matches the declared MIME type.
- Files are stored privately through the configured Medusa File Module provider under random keys. Database values contain only asset/file references, never local paths or binary data.
- Add-to-cart verifies asset ownership, template/field association, and exact correspondence between `upload_ids` and image field values.

## Cart and order preservation

- Different normalized values generate different deterministic personalization hashes and therefore distinct line metadata.
- Cart personalization records preserve normalized values, calculated surcharge, upload references, template snapshot, region/currency evidence and workflow status.
- The order-placed subscriber idempotently copies that record to an order-item snapshot.
- Paid order values are never edited by template changes. Vendor actions update only the explicit status and production notes fields.

## Statuses

`pending_review` -> `approved` or `rejected`; `approved` -> `in_production` or `completed`; `in_production` -> `completed`.
