import { and, count, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  adminAuditLogsTable,
  affiliateCommissionsTable,
  affiliateProfilesTable,
  campaignApplicationsTable,
  campaignsTable,
  coursesTable,
  db,
  eventsTable,
  ledgerEntriesTable,
  ordersTable,
  payoutRequestsTable,
  platformSettingsTable,
  productsTable,
  supportRequestsTable,
  ticketsTable,
  usersTable,
  vendorProfilesTable,
} from "@workspace/db";
import {
  GetAdminSettingsResponse,
  GetAdminSummaryResponse,
  ListAdminRecordsParams,
  ListAdminRecordsResponse,
  ReviewAdminRecordParams,
  ReviewAdminRecordBody,
  ReviewAdminRecordResponse,
  UpdateAdminSettingsBody,
  UpdateAdminSettingsResponse,
} from "@workspace/api-zod";
import {
  currentUser,
  requireAuthenticated,
  requireAdministrator,
} from "../middlewares/taskpayAuth";

const router: IRouter = Router();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function displayMoney(amountMinor: number, currency = "GHS"): string {
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

async function getSettings() {
  await db
    .insert(platformSettingsTable)
    .values({ id: "primary" })
    .onConflictDoNothing();
  const [settings] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.id, "primary"))
    .limit(1);
  return settings;
}

function settingsView(
  settings: NonNullable<Awaited<ReturnType<typeof getSettings>>>,
) {
  return {
    vendorMembershipMinor: settings.vendorMembershipMinor,
    vendorMembershipDays: settings.vendorMembershipDays,
    salesCommissionBps: settings.salesCommissionBps,
    affiliateDefaultBps: settings.affiliateDefaultBps,
    campaignFeeBps: settings.campaignFeeBps,
    courseCommissionBps: settings.courseCommissionBps,
    ticketFeeBps: settings.ticketFeeBps,
    minimumPayoutMinor: settings.minimumPayoutMinor,
    paymentStatus: "unconfigured",
    currency: settings.currency,
  };
}

async function listRecords(recordType: string) {
  switch (recordType) {
    case "users": {
      const rows = await db
        .select()
        .from(usersTable)
        .orderBy(desc(usersTable.createdAt));
      return rows.map((user) => ({
        id: user.id,
        recordType,
        title: user.fullName || user.email,
        status: user.status,
        ownerName: user.email,
        detail: `Roles: ${user.roles.join(", ")}`,
        createdAt: user.createdAt,
      }));
    }
    case "vendors": {
      const rows = await db
        .select({
          vendor: vendorProfilesTable,
          ownerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(vendorProfilesTable)
        .innerJoin(usersTable, eq(vendorProfilesTable.userId, usersTable.id))
        .orderBy(desc(vendorProfilesTable.createdAt));
      return rows.map(({ vendor, ownerName, email }) => ({
        id: vendor.id,
        recordType,
        title: vendor.storeName,
        status: vendor.status,
        ownerName: ownerName || email,
        detail: `${vendor.city}, ${vendor.country}`,
        createdAt: vendor.createdAt,
      }));
    }
    case "products": {
      const rows = await db
        .select({
          product: productsTable,
          storeName: vendorProfilesTable.storeName,
        })
        .from(productsTable)
        .innerJoin(
          vendorProfilesTable,
          eq(productsTable.vendorId, vendorProfilesTable.id),
        )
        .orderBy(desc(productsTable.createdAt));
      return rows.map(({ product, storeName }) => ({
        id: product.id,
        recordType,
        title: product.title,
        status: product.status,
        ownerName: storeName,
        detail: `${product.type} · ${displayMoney(product.priceMinor, product.currency)}`,
        createdAt: product.createdAt,
      }));
    }
    case "orders": {
      const rows = await db
        .select({
          order: ordersTable,
          buyerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(ordersTable)
        .innerJoin(usersTable, eq(ordersTable.userId, usersTable.id))
        .orderBy(desc(ordersTable.createdAt));
      return rows.map(({ order, buyerName, email }) => ({
        id: order.id,
        recordType,
        title: order.orderNumber,
        status: order.paymentStatus,
        ownerName: buyerName || email,
        detail: displayMoney(order.totalMinor, order.currency),
        createdAt: order.createdAt,
      }));
    }
    case "campaigns": {
      const rows = await db
        .select({
          campaign: campaignsTable,
          ownerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(campaignsTable)
        .innerJoin(usersTable, eq(campaignsTable.ownerId, usersTable.id))
        .orderBy(desc(campaignsTable.createdAt));
      return rows.map(({ campaign, ownerName, email }) => ({
        id: campaign.id,
        recordType,
        title: campaign.title,
        status: campaign.status,
        ownerName: ownerName || email,
        detail: `${campaign.businessName} · ${displayMoney(campaign.budgetMinor, campaign.currency)}`,
        createdAt: campaign.createdAt,
      }));
    }
    case "campaign-submissions": {
      const rows = await db
        .select({
          application: campaignApplicationsTable,
          campaignTitle: campaignsTable.title,
          promoterName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(campaignApplicationsTable)
        .innerJoin(
          campaignsTable,
          eq(campaignApplicationsTable.campaignId, campaignsTable.id),
        )
        .innerJoin(
          usersTable,
          eq(campaignApplicationsTable.promoterId, usersTable.id),
        )
        .orderBy(desc(campaignApplicationsTable.submittedAt));
      return rows.map(({ application, campaignTitle, promoterName, email }) => ({
        id: application.id,
        recordType,
        title: campaignTitle,
        status: application.status,
        ownerName: promoterName || email,
        detail: application.evidenceUrl ?? application.notes,
        createdAt: application.submittedAt,
      }));
    }
    case "courses": {
      const rows = await db
        .select({
          course: coursesTable,
          creatorName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(coursesTable)
        .innerJoin(usersTable, eq(coursesTable.creatorId, usersTable.id))
        .orderBy(desc(coursesTable.createdAt));
      return rows.map(({ course, creatorName, email }) => ({
        id: course.id,
        recordType,
        title: course.title,
        status: course.status,
        ownerName: creatorName || email,
        detail: displayMoney(course.priceMinor, course.currency),
        createdAt: course.createdAt,
      }));
    }
    case "events": {
      const rows = await db
        .select({
          event: eventsTable,
          ownerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(eventsTable)
        .innerJoin(usersTable, eq(eventsTable.organiserId, usersTable.id))
        .orderBy(desc(eventsTable.createdAt));
      return rows.map(({ event, ownerName, email }) => ({
        id: event.id,
        recordType,
        title: event.title,
        status: event.status,
        ownerName: ownerName || email,
        detail: `${event.city}, ${event.country}`,
        createdAt: event.createdAt,
      }));
    }
    case "affiliates": {
      const rows = await db
        .select({
          affiliate: affiliateProfilesTable,
          ownerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(affiliateProfilesTable)
        .innerJoin(usersTable, eq(affiliateProfilesTable.userId, usersTable.id))
        .orderBy(desc(affiliateProfilesTable.createdAt));
      return rows.map(({ affiliate, ownerName, email }) => ({
        id: affiliate.id,
        recordType,
        title: ownerName || email,
        status: affiliate.status,
        ownerName: email,
        detail: "Affiliate programme application",
        createdAt: affiliate.createdAt,
      }));
    }
    case "payouts": {
      const rows = await db
        .select({
          payout: payoutRequestsTable,
          ownerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(payoutRequestsTable)
        .innerJoin(usersTable, eq(payoutRequestsTable.userId, usersTable.id))
        .orderBy(desc(payoutRequestsTable.createdAt));
      return rows.map(({ payout, ownerName, email }) => ({
        id: payout.id,
        recordType,
        title: displayMoney(payout.amountMinor, payout.currency),
        status: payout.status,
        ownerName: ownerName || email,
        detail: `${payout.method} · ${payout.destination}`,
        createdAt: payout.createdAt,
      }));
    }
    case "support": {
      const rows = await db
        .select({
          support: supportRequestsTable,
          ownerName: usersTable.fullName,
          email: usersTable.email,
        })
        .from(supportRequestsTable)
        .innerJoin(usersTable, eq(supportRequestsTable.userId, usersTable.id))
        .orderBy(desc(supportRequestsTable.createdAt));
      return rows.map(({ support, ownerName, email }) => ({
        id: support.id,
        recordType,
        title: support.subject,
        status: support.status,
        ownerName: ownerName || email,
        detail: support.message,
        createdAt: support.createdAt,
      }));
    }
    default:
      return [];
  }
}

router.get(
  "/admin/summary",
  requireAuthenticated,
  requireAdministrator,
  async (_req, res): Promise<void> => {
    const [
      [users],
      [activeUsers],
      [vendors],
      [pendingVendors],
      [products],
      [pendingProducts],
      [orders],
      [paidVolume],
      [platformRevenue],
      [pendingPayouts],
      [campaigns],
      [pendingSubmissions],
      [courses],
      [events],
      [ticketsSold],
      [pendingCommissions],
    ] = await Promise.all([
      db.select({ value: count() }).from(usersTable),
      db
        .select({ value: count() })
        .from(usersTable)
        .where(eq(usersTable.status, "active")),
      db.select({ value: count() }).from(vendorProfilesTable),
      db
        .select({ value: count() })
        .from(vendorProfilesTable)
        .where(eq(vendorProfilesTable.status, "pending")),
      db.select({ value: count() }).from(productsTable),
      db
        .select({ value: count() })
        .from(productsTable)
        .where(eq(productsTable.status, "pending")),
      db.select({ value: count() }).from(ordersTable),
      db
        .select({
          value: sql<number>`coalesce(sum(total_minor), 0)::int`,
        })
        .from(ordersTable)
        .where(eq(ordersTable.paymentStatus, "paid")),
      db
        .select({
          value: sql<number>`coalesce(sum(amount_minor), 0)::int`,
        })
        .from(ledgerEntriesTable)
        .where(
          and(
            eq(ledgerEntriesTable.entryType, "platform_fee"),
            eq(ledgerEntriesTable.status, "available"),
          ),
        ),
      db
        .select({ value: count() })
        .from(payoutRequestsTable)
        .where(eq(payoutRequestsTable.status, "pending")),
      db
        .select({ value: count() })
        .from(campaignsTable)
        .where(eq(campaignsTable.status, "open")),
      db
        .select({ value: count() })
        .from(campaignApplicationsTable)
        .where(eq(campaignApplicationsTable.status, "submitted")),
      db
        .select({ value: count() })
        .from(coursesTable)
        .where(eq(coursesTable.status, "published")),
      db
        .select({ value: count() })
        .from(eventsTable)
        .where(eq(eventsTable.status, "published")),
      db
        .select({ value: count() })
        .from(ticketsTable)
        .where(eq(ticketsTable.paymentStatus, "paid")),
      db
        .select({
          value: sql<number>`coalesce(sum(amount_minor), 0)::int`,
        })
        .from(affiliateCommissionsTable)
        .where(eq(affiliateCommissionsTable.status, "pending")),
    ]);

    const [physicalProducts, digitalProducts] = await Promise.all([
      db
        .select({ value: count() })
        .from(productsTable)
        .where(eq(productsTable.type, "physical")),
      db
        .select({ value: count() })
        .from(productsTable)
        .where(eq(productsTable.type, "digital")),
    ]);

    res.json(
      GetAdminSummaryResponse.parse({
        users: users?.value ?? 0,
        activeUsers: activeUsers?.value ?? 0,
        vendors: vendors?.value ?? 0,
        pendingVendors: pendingVendors?.value ?? 0,
        products: products?.value ?? 0,
        pendingProducts: pendingProducts?.value ?? 0,
        orders: orders?.value ?? 0,
        paidVolumeMinor: paidVolume?.value ?? 0,
        platformRevenueMinor: platformRevenue?.value ?? 0,
        pendingPayouts: pendingPayouts?.value ?? 0,
        campaigns: campaigns?.value ?? 0,
        pendingSubmissions: pendingSubmissions?.value ?? 0,
        courses: courses?.value ?? 0,
        events: events?.value ?? 0,
        ticketsSold: ticketsSold?.value ?? 0,
        physicalProducts: physicalProducts[0]?.value ?? 0,
        digitalProducts: digitalProducts[0]?.value ?? 0,
        pendingCommissionsMinor: pendingCommissions?.value ?? 0,
        currency: "GHS",
      }),
    );
  },
);

router.get(
  "/admin/records/:recordType",
  requireAuthenticated,
  requireAdministrator,
  async (req, res): Promise<void> => {
    const params = ListAdminRecordsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "This admin record type is not supported." });
      return;
    }
    res.json(
      ListAdminRecordsResponse.parse(
        await listRecords(params.data.recordType),
      ),
    );
  },
);

router.patch(
  "/admin/records/:recordType/:recordId",
  requireAuthenticated,
  requireAdministrator,
  async (req, res): Promise<void> => {
    const params = ReviewAdminRecordParams.safeParse(req.params);
    const parsed = ReviewAdminRecordBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Review details are invalid." });
      return;
    }
    const { recordType, recordId } = params.data;
    if (!UUID_RE.test(recordId)) {
      res.status(400).json({ error: "Record ID is invalid." });
      return;
    }
    const { status, reason } = parsed.data;
    const actor = currentUser(res);
    const targetType = recordType;

    try {
      await db.transaction(async (tx) => {
      if (recordType === "users") {
        if (!["active", "suspended"].includes(status)) {
          throw new AdminReviewError("Users can only be activated or suspended.");
        }
        const [target] = await tx
          .update(usersTable)
          .set({ status })
          .where(eq(usersTable.id, recordId))
          .returning({ id: usersTable.id });
        if (!target) throw new AdminReviewError("User not found.", 404);
      } else if (recordType === "vendors") {
        if (!["approved", "rejected", "suspended"].includes(status)) {
          throw new AdminReviewError("Vendor status is not allowed.");
        }
        const settings = await tx
          .select()
          .from(platformSettingsTable)
          .where(eq(platformSettingsTable.id, "primary"))
          .limit(1);
        const membershipFee = settings[0]?.vendorMembershipMinor ?? 0;
        if (status === "approved" && membershipFee > 0) {
          throw new AdminReviewError(
            "Vendor membership payments are not configured; do not approve an unpaid membership.",
            409,
          );
        }
        const expiry =
          status === "approved"
            ? new Date(
                Date.now() +
                  (settings[0]?.vendorMembershipDays ?? 365) *
                    24 *
                    60 *
                    60 *
                    1000,
              )
            : null;
        const [vendor] = await tx
          .update(vendorProfilesTable)
          .set({ status, membershipExpiresAt: expiry })
          .where(eq(vendorProfilesTable.id, recordId))
          .returning({ userId: vendorProfilesTable.userId });
        if (!vendor) throw new AdminReviewError("Vendor application not found.", 404);
        const [owner] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, vendor.userId))
          .limit(1);
        if (owner) {
          const roles = new Set(owner.roles);
          if (status === "approved") roles.add("vendor");
          else roles.delete("vendor");
          await tx
            .update(usersTable)
            .set({ roles: [...roles] })
            .where(eq(usersTable.id, owner.id));
        }
      } else if (recordType === "products") {
        if (!["published", "rejected", "archived"].includes(status)) {
          throw new AdminReviewError("Product status is not allowed.");
        }
        const [product] = await tx
          .update(productsTable)
          .set({ status })
          .where(eq(productsTable.id, recordId))
          .returning({ id: productsTable.id });
        if (!product) throw new AdminReviewError("Product not found.", 404);
      } else if (recordType === "campaigns") {
        if (!["open", "rejected", "cancelled"].includes(status)) {
          throw new AdminReviewError("Campaign status is not allowed.");
        }
        const [campaign] = await tx
          .update(campaignsTable)
          .set({ status })
          .where(eq(campaignsTable.id, recordId))
          .returning({ id: campaignsTable.id });
        if (!campaign) throw new AdminReviewError("Campaign not found.", 404);
      } else if (recordType === "campaign-submissions") {
        if (!["revision_requested", "approved", "rejected"].includes(status)) {
          throw new AdminReviewError("Submission status is not allowed.");
        }
        const [submission] = await tx
          .update(campaignApplicationsTable)
          .set({ status, feedback: reason })
          .where(eq(campaignApplicationsTable.id, recordId))
          .returning({ id: campaignApplicationsTable.id });
        if (!submission) throw new AdminReviewError("Submission not found.", 404);
      } else if (recordType === "courses") {
        if (!["published", "rejected", "archived"].includes(status)) {
          throw new AdminReviewError("Course status is not allowed.");
        }
        const [course] = await tx
          .update(coursesTable)
          .set({ status })
          .where(eq(coursesTable.id, recordId))
          .returning({ id: coursesTable.id });
        if (!course) throw new AdminReviewError("Course not found.", 404);
      } else if (recordType === "events") {
        if (!["published", "rejected", "cancelled"].includes(status)) {
          throw new AdminReviewError("Event status is not allowed.");
        }
        const [event] = await tx
          .update(eventsTable)
          .set({ status })
          .where(eq(eventsTable.id, recordId))
          .returning({ id: eventsTable.id });
        if (!event) throw new AdminReviewError("Event not found.", 404);
      } else if (recordType === "affiliates") {
        if (!["approved", "rejected"].includes(status)) {
          throw new AdminReviewError("Affiliate status is not allowed.");
        }
        const [affiliate] = await tx
          .update(affiliateProfilesTable)
          .set({ status })
          .where(eq(affiliateProfilesTable.id, recordId))
          .returning({ userId: affiliateProfilesTable.userId });
        if (!affiliate) throw new AdminReviewError("Affiliate application not found.", 404);
        const [owner] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, affiliate.userId))
          .limit(1);
        if (owner) {
          const roles = new Set(owner.roles);
          if (status === "approved") roles.add("affiliate");
          else roles.delete("affiliate");
          await tx
            .update(usersTable)
            .set({ roles: [...roles] })
            .where(eq(usersTable.id, owner.id));
        }
      } else if (recordType === "payouts") {
        if (!["approved", "rejected"].includes(status)) {
          throw new AdminReviewError(
            "Payout requests can be approved or rejected here, but cannot be marked paid without a verified payout reference.",
          );
        }
        const [payout] = await tx
          .update(payoutRequestsTable)
          .set({ status, reviewReason: reason, reviewedAt: new Date() })
          .where(eq(payoutRequestsTable.id, recordId))
          .returning({ id: payoutRequestsTable.id });
        if (!payout) throw new AdminReviewError("Payout request not found.", 404);
      } else if (recordType === "support") {
        if (!["in_progress", "resolved"].includes(status)) {
          throw new AdminReviewError("Support status is not allowed.");
        }
        const [ticket] = await tx
          .update(supportRequestsTable)
          .set({ status, updatedAt: new Date() })
          .where(eq(supportRequestsTable.id, recordId))
          .returning({ id: supportRequestsTable.id });
        if (!ticket) throw new AdminReviewError("Support request not found.", 404);
      } else {
        throw new AdminReviewError("This record type cannot be reviewed.");
      }

      await tx.insert(adminAuditLogsTable).values({
        actorUserId: actor.id,
        action: "record_review",
        targetType,
        targetId: recordId,
        reason: reason.trim(),
        metadata: { status },
      });
      });
    } catch (error) {
      if (error instanceof AdminReviewError) {
        res.status(error.statusCode).json({ error: error.message });
        return;
      }
      throw error;
    }

    const record = (await listRecords(recordType)).find(
      (item) => item.id === recordId,
    );
    if (!record) {
      res.status(404).json({ error: "Reviewed record was not found." });
      return;
    }
    res.json(ReviewAdminRecordResponse.parse(record));
  },
);

router.get(
  "/admin/settings",
  requireAuthenticated,
  requireAdministrator,
  async (_req, res): Promise<void> => {
    const settings = await getSettings();
    if (!settings) {
      res.status(500).json({ error: "Platform settings are unavailable." });
      return;
    }
    res.json(
      GetAdminSettingsResponse.parse(settingsView(settings)),
    );
  },
);

router.patch(
  "/admin/settings",
  requireAuthenticated,
  requireAdministrator,
  async (req, res): Promise<void> => {
    const parsed = UpdateAdminSettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Platform settings are invalid." });
      return;
    }
    const actor = currentUser(res);
    const settings = await getSettings();
    if (!settings) {
      res.status(500).json({ error: "Platform settings are unavailable." });
      return;
    }
    const [updated] = await db
      .update(platformSettingsTable)
      .set(parsed.data)
      .where(eq(platformSettingsTable.id, "primary"))
      .returning();

    await db.insert(adminAuditLogsTable).values({
      actorUserId: actor.id,
      action: "platform_settings_update",
      targetType: "platform_settings",
      targetId: "primary",
      reason: "Platform settings updated.",
      metadata: parsed.data,
    });

    res.json(
      UpdateAdminSettingsResponse.parse(settingsView(updated)),
    );
  },
);

class AdminReviewError extends Error {
  constructor(
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export default router;
