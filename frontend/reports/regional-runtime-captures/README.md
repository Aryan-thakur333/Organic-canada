# Regional Runtime Capture Notes

This directory contains only sanitized runtime observations. No API keys,
authorization headers, cookies, customer details, or cart identifiers are
stored here.

The browser automation runtime exposed console capture but not an HTTP request
interception API. Consequently, it cannot provide a complete Network-tab style
request archive without adding credentials-sensitive diagnostics to the app.
Those diagnostics were deliberately not added.

Observed from the authenticated browser run:

- Canada cart creation completed before the line-item attempt.
- The subsequent `POST /store/carts/{redacted}/line-items` request was rejected
  by Medusa because Organic Apples lacks required inventory.
- No order, checkout, payment, price, or catalog mutation was performed.
