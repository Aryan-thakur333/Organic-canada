const BASE_URL = process.env.MEDUSA_BACKEND_URL || "http://localhost:9000";
const PRODUCT_ID = process.env.PERSONALIZED_PRODUCT_ID || "";
const VENDOR_TOKEN = process.env.VENDOR_TOKEN || "";
const SECOND_VENDOR_TOKEN = process.env.SECOND_VENDOR_TOKEN || "";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const STANDARD_PRODUCT_ID = process.env.STANDARD_PRODUCT_ID || "";

const PUBLISHABLE_KEY = "pk_7c77314f27ecee7ec1cd570d5dafe23b5622981632dc5d6f2aa81531045b2491";

function headers(token) {
  const h = {
    "x-publishable-api-key": PUBLISHABLE_KEY,
    "Content-Type": "application/json",
  };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

let total = 0;
let passed = 0;
let failed = 0;
let skipped = 0;

async function runTest(name, expectedStatus, path, method = "GET", body = null, token = null) {
  total++;
  try {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: headers(token),
    };
    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const isPassed = res.status === expectedStatus;
    
    let resBody = null;
    try {
      resBody = await res.json();
    } catch (e) {
      // not JSON
    }

    const responseCode = resBody?.code || "";
    
    // Extra validation assertions
    let detailsPassed = isPassed;
    if (name === "Validate Valid Input & Price Adjustment" && isPassed) {
      if (resBody?.price_adjustment !== 500) {
        detailsPassed = false;
      }
    }

    if (detailsPassed) {
      passed++;
    } else {
      failed++;
    }

    console.log("\n[PERSONALIZATION_HTTP_TEST]");
    console.log(JSON.stringify({
      name,
      expectedStatus,
      actualStatus: res.status,
      responseCode,
      passed: detailsPassed,
    }, null, 2));

    return { status: res.status, data: resBody };
  } catch (error) {
    failed++;
    console.log("\n[PERSONALIZATION_HTTP_TEST]");
    console.log(JSON.stringify({
      name,
      expectedStatus,
      actualStatus: "ERROR",
      responseCode: error.message || String(error),
      passed: false,
    }, null, 2));
  }
}

async function run() {
  if (!PRODUCT_ID || !VENDOR_TOKEN) {
    console.error("Missing mandatory environment variables: PERSONALIZED_PRODUCT_ID and VENDOR_TOKEN must be set.");
    process.exit(1);
  }

  let templateId = "";

  // 1. Create template
  const createRes = await runTest(
    "Create Template",
    201,
    "/vendor/personalization-templates",
    "POST",
    {
      product_id: PRODUCT_ID,
      title: "Integr Test Template",
      description: "Verification testing",
    },
    VENDOR_TOKEN
  );
  if (createRes && createRes.data?.template?.id) {
    templateId = createRes.data.template.id;
  }

  if (!templateId) {
    console.error("Template creation failed, stopping tests.");
    console.log(`\n[PERSONALIZATION_RUNTIME_VERIFICATION_DONE]`);
    console.log(JSON.stringify({ total, passed, failed, skipped }, null, 2));
    process.exit(1);
  }

  // 2. Add required text field
  await runTest(
    "Add Required Text Field",
    201,
    `/vendor/personalization-templates/${templateId}/fields`,
    "POST",
    {
      key: "engraving_text",
      label: "Your engraving",
      field_type: "text",
      is_required: true,
      min_length: 3,
      max_length: 10,
    },
    VENDOR_TOKEN
  );

  // 3. Add checkbox with price adjustment
  await runTest(
    "Add Checkbox Field with Price",
    201,
    `/vendor/personalization-templates/${templateId}/fields`,
    "POST",
    {
      key: "gift_wrap",
      label: "Wrap as a gift",
      field_type: "checkbox",
      is_required: false,
      price_adjustment: 500,
    },
    VENDOR_TOKEN
  );

  // 4. Get draft
  await runTest(
    "Get Draft Template",
    200,
    `/vendor/personalization-templates/${templateId}`,
    "GET",
    null,
    VENDOR_TOKEN
  );

  // 5. Publish
  await runTest(
    "Publish Template",
    200,
    `/vendor/personalization-templates/${templateId}/publish`,
    "POST",
    {},
    VENDOR_TOKEN
  );

  // 6. Get published store template
  await runTest(
    "Get Published Store Template",
    200,
    `/store/products/${PRODUCT_ID}/personalization`
  );

  // 7. Validate correct values & 8. Verify server price adjustment
  await runTest(
    "Validate Valid Input & Price Adjustment",
    200,
    `/store/products/${PRODUCT_ID}/personalization/validate`,
    "POST",
    {
      values: {
        engraving_text: "Eatsie",
        gift_wrap: true,
      },
    }
  );

  // 9. Missing required field
  await runTest(
    "Validate Fails - Missing Required Field",
    422,
    `/store/products/${PRODUCT_ID}/personalization/validate`,
    "POST",
    {
      values: {
        gift_wrap: true,
      },
    }
  );

  // 10. Unknown field
  await runTest(
    "Validate Fails - Unknown Field",
    422,
    `/store/products/${PRODUCT_ID}/personalization/validate`,
    "POST",
    {
      values: {
        engraving_text: "Eatsie",
        some_unknown_value: "hello",
      },
    }
  );

  // 11. Text too long
  await runTest(
    "Validate Fails - Text Too Long",
    422,
    `/store/products/${PRODUCT_ID}/personalization/validate`,
    "POST",
    {
      values: {
        engraving_text: "this text is way too long for max_length 10",
      },
    }
  );

  // 12. Invalid select/radio
  // Add a select field first
  await runTest(
    "Add Select Field",
    201,
    `/vendor/personalization-templates/${templateId}/fields`,
    "POST",
    {
      key: "font_size",
      label: "Font Size",
      field_type: "select",
      is_required: false,
      allowed_values: ["small", "medium", "large"],
    },
    VENDOR_TOKEN
  );
  
  // Publish updated template again
  await runTest(
    "Republish Template",
    200,
    `/vendor/personalization-templates/${templateId}/publish`,
    "POST",
    {},
    VENDOR_TOKEN
  );

  await runTest(
    "Validate Fails - Invalid Select Option",
    422,
    `/store/products/${PRODUCT_ID}/personalization/validate`,
    "POST",
    {
      values: {
        engraving_text: "Eatsie",
        font_size: "huge",
      },
    }
  );

  // 13. Duplicate field key
  await runTest(
    "Create Field Fails - Duplicate Key",
    409,
    `/vendor/personalization-templates/${templateId}/fields`,
    "POST",
    {
      key: "engraving_text",
      label: "Duplicate",
      field_type: "text",
    },
    VENDOR_TOKEN
  );

  // 14. Empty publish
  let emptyTemplateId = "";
  const emptyCreate = await fetch(`${BASE_URL}/vendor/personalization-templates`, {
    method: "POST",
    headers: headers(VENDOR_TOKEN),
    body: JSON.stringify({
      product_id: PRODUCT_ID,
      title: "Empty Template",
    }),
  });
  if (emptyCreate.ok) {
    const body = await emptyCreate.json();
    emptyTemplateId = body.template?.id;
  }
  if (emptyTemplateId) {
    await runTest(
      "Publish Fails - Empty Fields",
      422,
      `/vendor/personalization-templates/${emptyTemplateId}/publish`,
      "POST",
      {},
      VENDOR_TOKEN
    );
    // Clean up empty template
    await fetch(`${BASE_URL}/vendor/personalization-templates/${emptyTemplateId}`, {
      method: "DELETE",
      headers: headers(VENDOR_TOKEN),
    });
  } else {
    skipped++;
  }

  // 15. Standard product rejection
  if (STANDARD_PRODUCT_ID) {
    await runTest(
      "Create Template Fails - Standard Product",
      422,
      "/vendor/personalization-templates",
      "POST",
      {
        product_id: STANDARD_PRODUCT_ID,
        title: "Standard Template",
      },
      VENDOR_TOKEN
    );
  } else {
    skipped++;
  }

  // 16. Cross-vendor access
  if (SECOND_VENDOR_TOKEN) {
    await runTest(
      "Cross-Vendor Access Blocked",
      403,
      `/vendor/personalization-templates/${templateId}`,
      "GET",
      null,
      SECOND_VENDOR_TOKEN
    );
  } else {
    skipped++;
  }

  // 17. Soft-delete
  await runTest(
    "Soft Delete Template",
    200,
    `/vendor/personalization-templates/${templateId}`,
    "DELETE",
    null,
    VENDOR_TOKEN
  );

  // 18. Deleted template hidden
  await runTest(
    "Deleted Template Hidden from Store",
    404,
    `/store/products/${PRODUCT_ID}/personalization`
  );

  console.log(`\n[PERSONALIZATION_RUNTIME_VERIFICATION_DONE]`);
  console.log(JSON.stringify({
    total,
    passed,
    failed,
    skipped,
  }, null, 2));

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
