export function extractB2BProducts(response) {
  if (!response) {
    console.warn("[extractB2BProducts] Response is null/undefined");
    return [];
  }

  const candidates = [
    response?.products,
    response?.data?.products,
    response?.data?.data?.products,
    response?.data?.result?.products,
    response?.result?.products,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  // If response itself is an array, return it
  if (Array.isArray(response)) return response;

  console.warn("[extractB2BProducts] Could not extract products from response", {
    keys: Object.keys(response),
    type: typeof response,
    isArray: Array.isArray(response),
  });

  return [];
}

export function extractB2BResponseMeta(response) {
  if (!response) return null;
  // If response has a .data property that is an object, use it
  if (response?.data && typeof response.data === 'object' && !Array.isArray(response.data)) {
    return response.data;
  }
  // Otherwise return response itself (axios interceptor already unwraps)
  return response;
}

export function extractB2BMeta(response) {
  return {
    count:
      response?.count ??
      response?.data?.count ??
      response?.data?.data?.count ??
      0,
    price_list:
      response?.price_list ??
      response?.data?.price_list ??
      response?.data?.data?.price_list ??
      null,
    company:
      response?.company ??
      response?.data?.company ??
      response?.data?.data?.company ??
      null,
    debug:
      response?.debug ??
      response?.data?.debug ??
      response?.data?.data?.debug ??
      null,
  };
}

export function extractB2BQuotes(response) {
  const candidates = [
    response?.quotes,
    response?.data?.quotes,
    response?.data?.data?.quotes,
    response?.items,
    response?.data?.items,
  ];

  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }

  return [];
}
