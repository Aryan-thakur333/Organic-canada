import { ExecArgs } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  ProductStatus,
} from "@medusajs/framework/utils";
import {
  createProductsWorkflow,
} from "@medusajs/medusa/core-flows";

export default async function addProducts({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  
  const shipping_profile_id = "sp_01KPTYFEP1RTS93DK6DQ4MD43E";
  const sales_channel_id = "sc_01KPTYFKX5QA3XZHTDG4N5ESHM";

  const productsData = [
    { title: "Organic Gala Apples", price: 499, img: "organic_apples.png", category: "Fruits" },
    { title: "Organic Bananas", price: 299, img: "organic_apples.png", category: "Fruits" },
    { title: "Organic Blueberries", price: 599, img: "organic_apples.png", category: "Fruits" },
    { title: "Organic Carrots", price: 349, img: "organic_vegetables.png", category: "Vegetables" },
    { title: "Organic Spinach", price: 399, img: "organic_vegetables.png", category: "Vegetables" },
    { title: "Organic Avocado", price: 199, img: "organic_vegetables.png", category: "Vegetables" },
    { title: "Organic Whole Milk", price: 649, img: "organic_dairy.png", category: "Dairy" },
    { title: "Organic Greek Yogurt", price: 549, img: "organic_dairy.png", category: "Dairy" },
    { title: "Organic Cheddar Cheese", price: 799, img: "organic_dairy.png", category: "Dairy" },
    { title: "Organic Free Range Eggs", price: 699, img: "organic_dairy.png", category: "Dairy" },
    { title: "Organic Sourdough Bread", price: 599, img: "organic_bakery.png", category: "Bakery" },
    { title: "Organic Whole Wheat Flour", price: 899, img: "organic_bakery.png", category: "Bakery" },
    { title: "Organic Quinoa", price: 1299, img: "organic_bakery.png", category: "Grains" },
    { title: "Organic Extra Virgin Olive Oil", price: 2499, img: "organic_bakery.png", category: "Pantry" },
    { title: "Organic Honey", price: 1199, img: "organic_bakery.png", category: "Pantry" },
    { title: "Organic Almonds", price: 1499, img: "organic_bakery.png", category: "Nuts" },
    { title: "Organic Chicken Breast", price: 1599, img: "organic_meat.png", category: "Meat" },
    { title: "Organic Ground Beef", price: 1299, img: "organic_meat.png", category: "Meat" },
    { title: "Organic Atlantic Salmon", price: 1999, img: "organic_meat.png", category: "Seafood" },
    { title: "Organic Tofu", price: 449, img: "organic_meat.png", category: "Plant-based" },
  ];

  logger.info(`Adding ${productsData.length} products...`);

  const products = productsData.map((p, i) => ({
    title: p.title,
    description: `Premium quality ${p.title.toLowerCase()} sourced from local organic farms in Canada.`,
    handle: p.title.toLowerCase().replace(/ /g, "-") + "-" + i,
    status: ProductStatus.PUBLISHED,
    shipping_profile_id,
    images: [{ url: `http://localhost:9000/static/${p.img}` }],
    options: [{ title: "Package", values: ["Standard"] }],
    variants: [
      {
        title: "Standard",
        sku: `ORG-${p.title.substring(0, 3).toUpperCase()}-${i}`,
        options: { Package: "Standard" },
        manage_inventory: false,
        prices: [
          { amount: p.price, currency_code: "usd" },
          { amount: p.price, currency_code: "eur" }
        ],
      },
    ],
    sales_channels: [{ id: sales_channel_id }],
  }));

  try {
    await createProductsWorkflow(container).run({
      input: { products },
    });
    logger.info("Successfully added all products!");
  } catch (error) {
    logger.error("Failed to add products: " + error.message);
    throw error;
  }
}
