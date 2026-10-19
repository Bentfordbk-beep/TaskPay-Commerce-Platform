import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { productsTable } from "./catalog";
import { usersTable } from "./identity";

export const cartsTable = pgTable(
  "taskpay_carts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("taskpay_carts_user_idx").on(table.userId)],
);

export const cartItemsTable = pgTable(
  "taskpay_cart_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cartId: uuid("cart_id")
      .notNull()
      .references(() => cartsTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("taskpay_cart_item_product_idx").on(
      table.cartId,
      table.productId,
    ),
    index("taskpay_cart_items_cart_idx").on(table.cartId),
  ],
);

export const ordersTable = pgTable(
  "taskpay_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    orderNumber: text("order_number").notNull().unique(),
    status: text("status").notNull().default("pending"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    subtotalMinor: integer("subtotal_minor").notNull(),
    platformFeeMinor: integer("platform_fee_minor").notNull().default(0),
    deliveryMinor: integer("delivery_minor").notNull().default(0),
    totalMinor: integer("total_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    shippingName: text("shipping_name"),
    shippingPhone: text("shipping_phone"),
    shippingAddress: text("shipping_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("taskpay_orders_user_idx").on(table.userId),
    index("taskpay_orders_payment_status_idx").on(table.paymentStatus),
  ],
);

export const orderItemsTable = pgTable(
  "taskpay_order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => productsTable.id, {
      onDelete: "set null",
    }),
    titleSnapshot: text("title_snapshot").notNull(),
    typeSnapshot: text("type_snapshot").notNull(),
    priceMinorSnapshot: integer("price_minor_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    vendorIdSnapshot: uuid("vendor_id_snapshot"),
  },
  (table) => [index("taskpay_order_items_order_idx").on(table.orderId)],
);

export const paymentsTable = pgTable(
  "taskpay_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),
    provider: text("provider").notNull(),
    reference: text("reference").notNull().unique(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    status: text("status").notNull().default("pending"),
    providerTransactionId: text("provider_transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (table) => [index("taskpay_payments_order_idx").on(table.orderId)],
);

export const paymentEventsTable = pgTable(
  "taskpay_payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerEventId: text("provider_event_id").notNull().unique(),
    paymentReference: text("payment_reference").notNull(),
    eventType: text("event_type").notNull(),
    verified: boolean("verified").notNull().default(false),
    payload: jsonb("payload").notNull().default({}),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const ledgerEntriesTable = pgTable(
  "taskpay_ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => usersTable.id, {
      onDelete: "restrict",
    }),
    orderId: uuid("order_id").references(() => ordersTable.id, {
      onDelete: "restrict",
    }),
    reference: text("reference").notNull().unique(),
    entryType: text("entry_type").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    status: text("status").notNull().default("pending"),
    description: text("description").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("taskpay_ledger_user_status_idx").on(table.userId, table.status),
    index("taskpay_ledger_order_idx").on(table.orderId),
  ],
);

export const payoutRequestsTable = pgTable(
  "taskpay_payout_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    method: text("method").notNull(),
    destination: text("destination").notNull(),
    status: text("status").notNull().default("pending"),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("taskpay_payout_user_status_idx").on(table.userId, table.status),
    index("taskpay_payout_status_idx").on(table.status),
  ],
);
