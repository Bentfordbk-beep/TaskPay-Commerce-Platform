import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable, vendorProfilesTable } from "./identity";

export const categoriesTable = pgTable(
  "taskpay_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    scope: text("scope").notNull(),
    parentId: uuid("parent_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("taskpay_categories_scope_slug_idx").on(
      table.scope,
      table.slug,
    ),
    index("taskpay_categories_scope_idx").on(table.scope),
  ],
);

export const productsTable = pgTable(
  "taskpay_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendorProfilesTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    type: text("type").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict" }),
    priceMinor: integer("price_minor").notNull(),
    salePriceMinor: integer("sale_price_minor"),
    currency: text("currency").notNull().default("GHS"),
    imageUrl: text("image_url"),
    stockQuantity: integer("stock_quantity"),
    condition: text("condition"),
    deliverySummary: text("delivery_summary"),
    status: text("status").notNull().default("pending"),
    affiliateEligible: boolean("affiliate_eligible").notNull().default(false),
    commissionRateBps: integer("commission_rate_bps").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("taskpay_products_type_status_idx").on(table.type, table.status),
    index("taskpay_products_category_idx").on(table.categoryId),
    index("taskpay_products_vendor_idx").on(table.vendorId),
  ],
);

export type Category = typeof categoriesTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
