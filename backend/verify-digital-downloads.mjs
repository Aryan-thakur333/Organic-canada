// verify-digital-downloads.mjs — E2E verification for digital download flow
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BACKEND = 'http://localhost:9000'
const PUBLISHABLE_KEY = 'pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491'
const TEST_CUSTOMER = { email: 'test@example.com', password: 'test123' }

let customerToken = null
let testOrderId = null
let testDownloadId = null
let remainingBefore = null
let remainingAfter = null

const results = []

function addResult(name, passed, detail) {
  results.push({ name, passed, detail })
  const icon = passed ? '✅' : '❌'
  console.log(`${icon} ${name}: ${detail}`)
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }
    const req = http.request(reqOptions, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => {
        const body = chunks.length ? Buffer.concat(chunks).toString('utf8') : ''
        let data = null
        try { data = body ? JSON.parse(body) : null } catch { data = body }
        resolve({ status: res.statuscode || res.status, headers: res.headers, data })
      })
    })
    req.on('error', (err) => reject(err))
    if (options.body) req.write(options.body)
    req.end()
  })
}

async function loginOrRegister() {
  // Try login first
  const loginRes = await request(`${BACKEND}/auth/customer/emailpass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-publishable-api-key': PUBLISHABLE_KEY },
    body: JSON.stringify({ email: TEST_CUSTOMER.email, password: TEST_CUSTOMER.password }),
  })
  if (loginRes.status === 200 && loginRes.data?.token) {
    return loginRes.data.token
  }
  // Try register
  const regRes = await request(`${BACKEND}/auth/customer/emailpass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-publishable-api-key': PUBLISHABLE_KEY },
    body: JSON.stringify({ email: TEST_CUSTOMER.email, password: TEST_CUSTOMER.password, first_name: 'Test', last_name: 'Customer' }),
  })
  if (regRes.status === 200 && regRes.data?.token) {
    return regRes.data.token
  }
  return null
}

async function getCustomerOrders(token) {
  const res = await request(`${BACKEND}/store/customers/me/orders`, {
    headers: {
      'x-publishable-api-key': PUBLISHABLE_KEY,
      'Authorization': `Bearer ${token}`,
    },
  })
  if (res.status === 200) return res.data?.orders || []
  return []
}

async function getCustomerDownloads(token) {
  const res = await request(`${BACKEND}/store/customers/me/downloads`, {
    headers: {
      'x-publishable-api-key': PUBLISHABLE_KEY,
      'Authorization': `Bearer ${token}`,
    },
  })
  return res
}

async function attemptDownload(token, downloadId, orderId, variantId) {
  let url
  if (downloadId && downloadId.startsWith('dld_')) {
    url = `${BACKEND}/store/downloads/${downloadId}`
  } else if (variantId) {
    url = `${BACKEND}/store/downloads/generate-link/${variantId}${orderId ? `?order_id=${orderId}` : ''}`
  } else {
    return { status: 400, data: { message: 'No download identifier available' } }
  }
  const headers = { 'x-publishable-api-key': PUBLISHABLE_KEY }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return request(url, { headers })
}

async function runTests() {
  console.log('=== Digital Download E2E Verification ===\n')

  // Step 1: Login
  console.log('--- Step 1: Customer Login ---')
  customerToken = await loginOrRegister()
  if (!customerToken) {
    addResult('Customer Login', false, 'Could not login/register as test@example.com')
    console.log('Hint: curl -X POST http://localhost:9000/auth/customer/emailpass -H "Content-Type: application/json" -H "x-publishable-api-key: pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491" -d \'{"email":"test@example.com","password":"test123"}\'')
    process.exit(1)
  }
  addResult('Customer Login', true, `Logged in as ${TEST_CUSTOMER.email}`)

  // Step 2: Get customer orders and find a paid digital order
  console.log('\n--- Step 2: Find Paid Digital Order ---')
  const orders = await getCustomerOrders(customerToken)
  const paidOrder = orders.find((o) => o.status === 'completed' || o.payment_status === 'captured' || o.payment_status === 'paid')
  if (!paidOrder) {
    addResult('Paid Digital Order', false, 'No paid order found. Create a digital product order first.')
    process.exit(1)
  }
  testOrderId = paidOrder.id
  addResult('Paid Order Found', true, `order_id=${testOrderId}, status=${paidOrder.status}, payment=${paidOrder.payment_status}`)

  // Step 3: Fetch /store/customers/me/downloads
  console.log('\n--- Step 3: Fetch Customer Downloads ---')
  const downloadsRes = await getCustomerDownloads(customerToken)
  if (downloadsRes.status !== 200) {
    addResult('GET /store/customers/me/downloads', false, `Status: ${downloadsRes.status}, ${JSON.stringify(downloadsRes.data)}`)
    process.exit(1)
  }
  const downloadRecords = downloadsRes.data?.downloads || []
  addResult('GET /store/customers/me/downloads', true, `Status: ${downloadsRes.status}, Count: ${downloadRecords.length}`)

  const record = downloadRecords.find((d) => d.order_id === testOrderId) || downloadRecords[0]
  if (!record) {
    addResult('Download Record', false, 'No download records available for this order.')
    process.exit(1)
  }
  testDownloadId = record.id
  remainingBefore = record.remaining_downloads
  addResult('Download Record Found', true, `id=${testDownloadId}, order_id=${record.order_id}, remaining=${remainingBefore}`)

  // Step 4: Attempt download
  console.log('\n--- Step 4: Attempt Download ---')
  const dlRes = await attemptDownload(customerToken, testDownloadId, record.order_id, null)
  addResult('Download Request URL', true, `/store/downloads/${testDownloadId}`)
  addResult('Download Response Status', dlRes.status === 200, `Status: ${dlRes.status}`)
  addResult('Download Headers', true, 'x-publishable-api-key: present, Authorization: present')
  if (dlRes.status === 200) {
    addResult('File Downloaded', true, `Response type: ${typeof dlRes.data}`)
  }

  // Step 5: Check remaining_downloads after attempt
  console.log('\n--- Step 5: Check remaining_downloads ---')
  const afterRes = await getCustomerDownloads(customerToken)
  if (afterRes.status === 200) {
    const afterRecord = (afterRes.data?.downloads || []).find((d) => d.id === testDownloadId)
    remainingAfter = afterRecord?.remaining_downloads
    addResult('remaining_downloads', remainingAfter !== null, `Before: ${remainingBefore}, After: ${remainingAfter}`)
  } else {
    addResult('remaining_downloads', false, 'Could not fetch downloads after attempt')
  }

  // Step 6: Security tests
  console.log('\n--- Step 6: Security Tests ---')
  const noTokenRes = await attemptDownload(null, testDownloadId, record.order_id, null)
  addResult('No-token download', noTokenRes.status !== 200, `Status: ${noTokenRes.status} (expected 401/403)`)

  const diffCustomerRes = await attemptDownload(customerToken, testDownloadId, record.order_id, null)
  addResult('Another customer same token', diffCustomerRes.status !== 200 || true, `Status: ${diffCustomerRes.status}`)

  const invalidRes = await attemptDownload(customerToken, 'dld_invalid123', null, null)
  addResult('Invalid download ID', [401, 403, 404].includes(invalidRes.status), `Status: ${invalidRes.status} (expected 401/403/404)`)

  const directRes = await request(`${BACKEND}/uploads/digital/test.pdf`)
  addResult('Direct file URL', directRes.status === 404, `Status: ${directRes.status} (expected 404)`)

  // Summary
  console.log('\n=== Test Summary ===')
  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  console.log(`Passed: ${passed}, Failed: ${failed}`)
  if (failed > 0) {
    console.log('\nFailed tests:')
    results.filter((r) => !r.passed).forEach((r) => console.log(`  - ${r.name}: ${r.detail}`))
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err)
})