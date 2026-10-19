import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./identity";

export const platformSettingsTable = pgTable("taskpay_platform_settings", {
  id: text("id").primaryKey().default("primary"),
  vendorMembershipMinor: integer("vendor_membership_minor")
    .notNull()
    .default(0),
  vendorMembershipDays: integer("vendor_membership_days").notNull().default(365),
  salesCommissionBps: integer("sales_commission_bps").notNull().default(500),
  affiliateDefaultBps: integer("affiliate_default_bps").notNull().default(1000),
  campaignFeeBps: integer("campaign_fee_bps").notNull().default(500),
  courseCommissionBps: integer("course_commission_bps").notNull().default(1000),
  ticketFeeBps: integer("ticket_fee_bps").notNull().default(500),
  minimumPayoutMinor: integer("minimum_payout_minor").notNull().default(5000),
  currency: text("currency").notNull().default("GHS"),
  adminBootstrapComplete: boolean("admin_bootstrap_complete")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const notificationsTable = pgTable(
  "taskpay_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("taskpay_notifications_user_idx").on(table.userId)],
);

export const supportRequestsTable = pgTable(
  "taskpay_support_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("taskpay_support_user_idx").on(table.userId),
    index("taskpay_support_status_idx").on(table.status),
  ],
);

export const adminAuditLogsTable = pgTable(
  "taskpay_admin_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("taskpay_admin_audit_created_idx").on(table.createdAt)],
);

export type SupportRequest = typeof supportRequestsTable.$inferSelect;
