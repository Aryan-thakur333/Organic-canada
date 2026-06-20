/**
 * Correct common API / CMS thumbnail mismatches by product title.
 */
const THUMB_BY_TITLE = [
  {
    test: /\b(banana|bananas)\b/i,
    url: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(orange|oranges)\b/i,
    url: "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(apple|apples)\b/i,
    url: "https://images.unsplash.com/photo-1560806887-1e4df0c6a8dd?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(tomato|tomatoes)\b/i,
    url: "https://images.unsplash.com/photo-1592841200221-6887fe3333f7?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(bread|loaf)\b/i,
    url: "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(egg|eggs)\b/i,
    url: "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(spinach)\b/i,
    url: "https://images.unsplash.com/photo-1540420773420-278497d6545a?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(almond|almonds)\b/i,
    url: "https://images.unsplash.com/photo-1508747704545-d81549c62e93?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(olive oil)\b/i,
    url: "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=800&q=80",
  },
  {
    test: /\b(cereal)\b/i,
    url: "https://images.unsplash.com/photo-1521483451569-e33843c93308?auto=format&fit=crop&w=800&q=80",
  },
];

export function patchProductThumbnails(products) {
  if (!Array.isArray(products)) return [];

  return products.map((p) => {
    const title = p?.title || "";
    for (const rule of THUMB_BY_TITLE) {
      if (rule.test.test(title)) {
        return { ...p, thumbnail: rule.url };
      }
    }
    return p;
  });
}

function normTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\([^)]*\)/g, "")
    .trim();
}

/**
 * API products first; append catalog items whose titles are not already present.
 */
export function mergeUniqueProducts(remoteList, catalog) {
  const primary = Array.isArray(remoteList) ? remoteList : [];
  const extra = Array.isArray(catalog) ? catalog : [];
  const seen = new Set(primary.map((p) => normTitle(p.title)));
  const out = [...primary];
  for (const p of extra) {
    const k = normTitle(p.title);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}
