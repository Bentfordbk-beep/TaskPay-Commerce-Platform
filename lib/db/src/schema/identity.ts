import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "taskpay_users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull().default(""),
    phone: text("phone"),
    avatarUrl: text("avatar_url"),
    roles: text("roles").array().notNull().default(["customer"]),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("taskpay_users_email_idx").on(table.email),
    index("taskpay_users_status_idx").on(table.status),
  ],
);

export const vendorProfilesTable = pgTable(
  "taskpay_vendor_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    storeName: text("store_name").notNull(),
    description: text("description").notNull(),
    country: text("country").notNull(),
    city: text("city").notNull(),
    logoUrl: text("logo_url"),
    contactPhone: text("contact_phone").notNull(),
    status: text("status").notNull().default("pending"),
    membershipExpiresAt: timestamp("membership_expires_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("taskpay_vendor_profiles_user_idx").on(table.userId),
    index("taskpay_vendor_profiles_status_idx").on(table.status),
  ],
);

export type User = typeof usersTable.$inferSelect;
export type VendorProfile = typeof vendorProfilesTable.$inferSelect;
