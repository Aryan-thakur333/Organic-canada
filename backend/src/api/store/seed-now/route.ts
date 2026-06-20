import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ProductStatus } from "@medusajs/framework/utils"
import { createProductsWorkflow } from "@medusajs/medusa/core-flows"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve("query")

  try {
    const requiredCategoryHandles = ["fruits", "vegetables", "dairy", "bakery"]

    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: ["id", "handle", "name"],
      filters: {
        handle: requiredCategoryHandles,
      },
    })

    const categoryMap = categories.reduce(
      (acc: Record<string, string>, category: any) => {
        acc[category.handle] = category.id
        return acc
      },
      {}
    )

    const missingCategories = requiredCategoryHandles.filter(
      (handle) => !categoryMap[handle]
    )

    if (missingCategories.length) {
      return res.status(400).json({
        error: `Missing product categories: ${missingCategories.join(", ")}`,
      })
    }

    const productsData = [
      {
        title: "Premium Organic Apples",
        handle: "gala-apples",
        categoryHandle: "fruits",
        price: 499,
      },
      {
        title: "Sweet Juicy Lemon",
        handle: "sweet-lemon",
        categoryHandle: "fruits",
        price: 299,
      },
      {
        title: "Fresh Spinach Bunch",
        handle: "fresh-spinach",
        categoryHandle: "vegetables",
        price: 199,
      },
      {
        title: "Roma Tomatoes",
        handle: "roma-tomatoes",
        categoryHandle: "vegetables",
        price: 249,
      },
      {
        title: "Organic Whole Milk",
        handle: "whole-milk",
        categoryHandle: "dairy",
        price: 349,
      },
      {
        title: "Greek Yogurt",
        handle: "greek-yogurt",
        categoryHandle: "dairy",
        price: 599,
      },
      {
        title: "Salted Farm Butter",
        handle: "farm-butter",
        categoryHandle: "dairy",
        price: 449,
      },
      {
        title: "Artisan Sourdough Bread",
        handle: "sourdough-bread",
        categoryHandle: "bakery",
        price: 549,
      },
      {
        title: "Whole Wheat Slices",
        handle: "whole-wheat",
        categoryHandle: "bakery",
        price: 349,
      },
      {
        title: "Garlic Butter Baguette",
        handle: "garlic-baguette",
        categoryHandle: "bakery",
        price: 399,
      },
    ]

    const productsPayload = productsData.map((product) => {
      const categoryId = categoryMap[product.categoryHandle]

      return {
        title: product.title,
        handle: product.handle,
        status: ProductStatus.PUBLISHED,
        categories: [{ id: categoryId }],
        options: [{ title: "Size", values: ["Standard"] }],
        variants: [
          {
            title: "Standard",
            options: { Size: "Standard" },
            prices: [{ amount: product.price, currency_code: "eur" }],
          },
        ],
      }
    })

    const { result } = await createProductsWorkflow(req.scope).run({
      input: { products: productsPayload },
    })

    return res.json({
      message: "Successfully seeded 10 premium homepage products.",
      products: result,
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message })
  }
}
