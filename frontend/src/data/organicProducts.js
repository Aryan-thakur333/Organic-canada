/**
 * Local grocery catalog (Medusa-shaped) for Organic Canada shop.
 * Prices: `amount` is cents (USD).
 */
function v(amountCents, variantSuffix = "v1") {
  return [
    {
      id: `var-${variantSuffix}`,
      prices: [{ amount: amountCents }],
    },
  ];
}

export const ORGANIC_PRODUCTS = [
  {
    id: "oc-orange",
    title: "Orange",
    description: "Juicy, vitamin-rich citrus — perfect for snacking or juice.",
    thumbnail:
      "https://images.unsplash.com/photo-1547514701-42782101795e?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.6,
    variants: v(149, "orange"),
  },
  {
    id: "oc-apple",
    title: "Crisp Red Delicious Apples (1lb)",
    description: "Farm-fresh apples with a sweet crunch.",
    thumbnail:
      "https://images.unsplash.com/photo-1560806887-1e4df0c6a8dd?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.7,
    variants: v(299, "apple"),
  },
  {
    id: "oc-cherry-tomato",
    title: "Organic Cherry Tomatoes (Pint)",
    description: "Bursting mini tomatoes for salads and roasting.",
    thumbnail:
      "https://images.unsplash.com/photo-1592841200221-6887fe3333f7?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.8,
    variants: v(449, "cherry-tom"),
  },
  {
    id: "oc-banana",
    title: "Organic Premium Bananas (Bunch)",
    description: "Naturally ripened bananas — potassium-rich energy snack.",
    thumbnail:
      "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(199, "banana"),
  },
  {
    id: "oc-cereal",
    title: "Honey Nut Crunch Cereal (Box)",
    description: "Whole-grain flakes with a touch of honey.",
    thumbnail:
      "https://images.unsplash.com/photo-1521483451569-e33843c93308?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.4,
    variants: v(599, "cereal"),
  },
  {
    id: "oc-spinach",
    title: "Farm Fresh Spinach (Bunch)",
    description: "Tender leaves ideal for sautés and smoothies.",
    thumbnail:
      "https://images.unsplash.com/photo-1540420773420-278497d6545a?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.7,
    variants: v(249, "spinach"),
  },
  {
    id: "oc-eggs",
    title: "Farm Fresh Large Eggs (Dozen)",
    description: "Grade A large eggs from free-range hens.",
    thumbnail:
      "https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.9,
    variants: v(549, "eggs"),
  },
  {
    id: "oc-olive-oil",
    title: "Cold-Pressed Extra Virgin Olive Oil (500ml)",
    description: "Rich aroma for dressings, roasting, and finishing.",
    thumbnail:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.8,
    variants: v(1299, "oil"),
  },
  {
    id: "oc-almonds",
    title: "Premium Roasted Almonds (250g)",
    description: "Lightly salted, perfect for baking or snacking.",
    thumbnail:
      "https://images.unsplash.com/photo-1508747704545-d81549c62e93?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.6,
    variants: v(899, "almonds"),
  },
  {
    id: "oc-bread",
    title: "Artisan Whole Wheat Bread (Loaf)",
    description: "Slow-fermented loaf with hearty texture.",
    thumbnail:
      "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(449, "bread"),
  },
  {
    id: "oc-milk",
    title: "Organic Whole Milk (2L)",
    description: "Creamy milk from grass-fed cows.",
    thumbnail:
      "https://images.unsplash.com/photo-1563636619-e9143da7973b?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.7,
    variants: v(699, "milk"),
  },
  {
    id: "oc-yogurt",
    title: "Greek Yogurt Plain (750g)",
    description: "High-protein, thick strained yogurt.",
    thumbnail:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.6,
    variants: v(629, "yogurt"),
  },
  {
    id: "oc-avocado",
    title: "Hass Avocados (3 pack)",
    description: "Buttery avocados — ideal for toast and guacamole.",
    thumbnail:
      "https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(499, "avo"),
  },
  {
    id: "oc-blueberry",
    title: "Wild Blueberries (300g)",
    description: "Antioxidant-rich berries, great on oatmeal.",
    thumbnail:
      "https://images.unsplash.com/photo-1498557855253-38f05373637e?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.8,
    variants: v(749, "blue"),
  },
  {
    id: "oc-carrot",
    title: "Organic Rainbow Carrots (2lb)",
    description: "Sweet roots — roast, juice, or shred for salads.",
    thumbnail:
      "https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(349, "carrot"),
  },
  {
    id: "oc-potato",
    title: "Russet Baking Potatoes (5lb)",
    description: "Fluffy texture — perfect baked or mashed.",
    thumbnail:
      "https://images.unsplash.com/photo-1518977822532-1b16553649ae?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.4,
    variants: v(399, "potato"),
  },
  {
    id: "oc-salmon",
    title: "Atlantic Salmon Fillet (400g)",
    description: "Sustainably sourced, firm and flaky.",
    thumbnail:
      "https://images.unsplash.com/photo-1519708227418-c4ecd2a34128?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.7,
    variants: v(1899, "salmon"),
  },
  {
    id: "oc-chicken",
    title: "Air-Chilled Chicken Breast (2 pack)",
    description: "Lean protein for grilling or stir-fry.",
    thumbnail:
      "https://images.unsplash.com/photo-1604503468506-a8da13d82791?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.6,
    variants: v(1299, "chicken"),
  },
  {
    id: "oc-coffee",
    title: "Medium Roast Whole Bean Coffee (340g)",
    description: "Balanced notes of cocoa and toasted nuts.",
    thumbnail:
      "https://images.unsplash.com/photo-1497935586351-a67f1943b28c?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.8,
    variants: v(1499, "coffee"),
  },
  {
    id: "oc-honey",
    title: "Raw Wildflower Honey (500g)",
    description: "Unfiltered honey with floral aroma.",
    thumbnail:
      "https://images.unsplash.com/photo-1587049352846-4a222e2d9184?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.9,
    variants: v(1199, "honey"),
  },
  {
    id: "oc-quinoa",
    title: "Organic White Quinoa (1kg)",
    description: "Quick-cooking ancient grain for bowls and sides.",
    thumbnail:
      "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(899, "quinoa"),
  },
  {
    id: "oc-kale",
    title: "Curly Kale (Bunch)",
    description: "Hearty greens for chips, soups, and sautés.",
    thumbnail:
      "https://images.unsplash.com/photo-1524179091875-bf99a9a6af5b?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.4,
    variants: v(229, "kale"),
  },
  {
    id: "oc-strawberry",
    title: "Strawberries (1lb)",
    description: "Sweet berries — rinse and enjoy.",
    thumbnail:
      "https://images.unsplash.com/photo-1464965911861-746a04b4bca6?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.7,
    variants: v(599, "straw"),
  },
  {
    id: "oc-broccoli",
    title: "Organic Broccoli Crowns (2 pack)",
    description: "Crisp florets for roasting or steaming.",
    thumbnail:
      "https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(379, "broccoli"),
  },
  {
    id: "oc-onion",
    title: "Yellow Cooking Onions (3lb bag)",
    description: "Aromatic base for soups, stews, and stir-fries.",
    thumbnail:
      "https://images.unsplash.com/photo-1518977956812-cd2b65a65d67?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.3,
    variants: v(329, "onion"),
  },
  {
    id: "oc-lemon",
    title: "Fresh Lemons (5 pack)",
    description: "Bright acidity for drinks, dressings, and marinades.",
    thumbnail:
      "https://images.unsplash.com/photo-1580052619294-c5d52ba5edd8?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.6,
    variants: v(279, "lemon"),
  },
  {
    id: "oc-cucumber",
    title: "English Cucumbers (2 pack)",
    description: "Cool and crisp — ideal for salads.",
    thumbnail:
      "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.4,
    variants: v(249, "cuke"),
  },
  {
    id: "oc-rice",
    title: "Jasmine Rice (2kg)",
    description: "Fragrant long-grain rice for curries and bowls.",
    thumbnail:
      "https://images.unsplash.com/photo-1536304993881-92c9b827572c?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.6,
    variants: v(999, "rice"),
  },
  {
    id: "oc-pasta",
    title: "Bronze-Cut Penne Pasta (500g)",
    description: "Rough surface holds sauce beautifully.",
    thumbnail:
      "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.5,
    variants: v(349, "pasta"),
  },
  {
    id: "oc-butter",
    title: "Sea Salt Butter (250g)",
    description: "Cultured cream butter with flaky sea salt.",
    thumbnail:
      "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?auto=format&fit=crop&w=900&h=900&q=85",
    vendor: "Medusa Product",
    rating: 4.7,
    variants: v(529, "butter"),
  },
];

export function findOrganicProduct(id) {
  return ORGANIC_PRODUCTS.find((p) => p.id === id);
}
