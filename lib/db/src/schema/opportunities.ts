import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { categoriesTable } from "./catalog";
import { usersTable } from "./identity";

export const affiliateProfilesTable = pgTable(
  "taskpay_affiliate_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("taskpay_affiliate_profiles_user_idx").on(table.userId)],
);

export const affiliateLinksTable = pgTable(
  "taskpay_affiliate_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliateProfilesTable.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull(),
    code: text("code").notNull().unique(),
    clickCount: integer("click_count").notNull().default(0),
    conversionCount: integer("conversion_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("taskpay_affiliate_links_user_idx").on(table.affiliateId)],
);

export const affiliateCommissionsTable = pgTable(
  "taskpay_affiliate_commissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    affiliateId: uuid("affiliate_id")
      .notNull()
      .references(() => affiliateProfilesTable.id, { onDelete: "restrict" }),
    orderId: uuid("order_id").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("taskpay_affiliate_commission_order_idx").on(table.orderId),
    index("taskpay_affiliate_commission_user_status_idx").on(
      table.affiliateId,
      table.status,
    ),
  ],
);

export const campaignsTable = pgTable(
  "taskpay_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    businessName: text("business_name").notNull(),
    description: text("description").notNull(),
    objective: text("objective").notNull(),
    budgetMinor: integer("budget_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    status: text("status").notNull().default("pending_review"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("taskpay_campaigns_status_idx").on(table.status),
    index("taskpay_campaigns_owner_idx").on(table.ownerId),
  ],
);

export const campaignApplicationsTable = pgTable(
  "taskpay_campaign_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    promoterId: uuid("promoter_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("applied"),
    evidenceUrl: text("evidence_url"),
    notes: text("notes"),
    feedback: text("feedback"),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("taskpay_campaign_application_user_idx").on(
      table.campaignId,
      table.promoterId,
    ),
    index("taskpay_campaign_application_status_idx").on(table.status),
  ],
);

export const coursesTable = pgTable(
  "taskpay_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    imageUrl: text("image_url"),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("taskpay_courses_status_idx").on(table.status),
    index("taskpay_courses_creator_idx").on(table.creatorId),
  ],
);

export const courseLessonsTable = pgTable(
  "taskpay_course_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body"),
    contentUrl: text("content_url"),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("taskpay_course_lesson_position_idx").on(
      table.courseId,
      table.position,
    ),
    index("taskpay_course_lessons_course_idx").on(table.courseId),
  ],
);

export const courseEnrolmentsTable = pgTable(
  "taskpay_course_enrolments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => coursesTable.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    progressPercent: integer("progress_percent").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("taskpay_course_enrolment_user_idx").on(
      table.courseId,
      table.userId,
    ),
    index("taskpay_course_enrolment_status_idx").on(table.status),
  ],
);

export const eventsTable = pgTable(
  "taskpay_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organiserId: uuid("organiser_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categoriesTable.id, { onDelete: "restrict" }),
    imageUrl: text("image_url"),
    venue: text("venue").notNull(),
    city: text("city").notNull(),
    country: text("country").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("taskpay_events_status_date_idx").on(table.status, table.startsAt),
    index("taskpay_events_organiser_idx").on(table.organiserId),
  ],
);

export const ticketTypesTable = pgTable(
  "taskpay_ticket_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: text("currency").notNull().default("GHS"),
    quantityAvailable: integer("quantity_available").notNull(),
    quantityReserved: integer("quantity_reserved").notNull().default(0),
    salesStartAt: timestamp("sales_start_at", { withTimezone: true }),
    salesEndAt: timestamp("sales_end_at", { withTimezone: true }),
  },
  (table) => [index("taskpay_ticket_type_event_idx").on(table.eventId)],
);

export const ticketsTable = pgTable(
  "taskpay_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => eventsTable.id, { onDelete: "restrict" }),
    ticketTypeId: uuid("ticket_type_id")
      .notNull()
      .references(() => ticketTypesTable.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    paymentStatus: text("payment_status").notNull().default("pending"),
    ticketIdentifier: text("ticket_identifier").notNull().unique(),
    qrData: text("qr_data"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("taskpay_tickets_user_idx").on(table.userId),
    index("taskpay_tickets_event_idx").on(table.eventId),
  ],
);

export type Campaign = typeof campaignsTable.$inferSelect;
export type CampaignApplication = typeof campaignApplicationsTable.$inferSelect;
export type Course = typeof coursesTable.$inferSelect;
export type Event = typeof eventsTable.$inferSelect;
