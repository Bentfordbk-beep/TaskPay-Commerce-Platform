import { and, desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  affiliateCommissionsTable,
  affiliateLinksTable,
  affiliateProfilesTable,
  categoriesTable,
  db,
  productsTable,
  vendorProfilesTable,
} from "@workspace/db";
import {
  ApplyForAffiliateResponse,
  CreateAffiliateLinkBody,
  CreateAffiliateLinkResponse,
  GetAffiliateOverviewResponse,
  ListAffiliateLinksResponse,
} from "@workspace/api-zod";
import { currentUser, requireAuthenticated } from "../middlewares/taskpayAuth";

const router: IRouter = Router();

async function affiliateView(userId: string) {
  const [profile] = await db
    .select()
    .from(affiliateProfilesTable)
    .where(eq(affiliateProfilesTable.userId, userId))
    .limit(1);
  if (!profile) {
    return {
      status: "pending",
      applicationSubmitted: false,
      links: [],
      clicks: 0,
      conversions: 0,
      pendingCommissionMinor: 0,
      approvedCommissionMinor: 0,
      currency: "GHS",
    };
  }

  const rows = await db
    .select({
      link: affiliateLinksTable,
      productTitle: productsTable.title,
    })
    .from(affiliateLinksTable)
    .innerJoin(productsTable, eq(affiliateLinksTable.productId, productsTable.id))
    .where(eq(affiliateLinksTable.affiliateId, profile.id))
    .orderBy(desc(affiliateLinksTable.createdAt));
  const [commissionSummary] = await db
    .select({
      pending: sql<number>`coalesce(sum(case when status = 'pending' then amount_minor else 0 end), 0)::int`,
      approved: sql<number>`coalesce(sum(case when status = 'approved' then amount_minor else 0 end), 0)::int`,
    })
    .from(affiliateCommissionsTable)
    .where(eq(affiliateCommissionsTable.affiliateId, profile.id));
  return {
    status: profile.status,
    applicationSubmitted: true,
    links: rows.map(({ link, productTitle }) => ({
      id: link.id,
      productId: link.productId,
      productTitle,
      code: link.code,
      url: `/api/affiliate/r/${link.code}`,
      clickCount: link.clickCount,
      conversionCount: link.conversionCount,
    })),
    clicks: rows.reduce((total, row) => total + row.link.clickCount, 0),
    conversions: rows.reduce(
      (total, row) => total + row.link.conversionCount,
      0,
    ),
    pendingCommissionMinor: commissionSummary?.pending ?? 0,
    approvedCommissionMinor: commissionSummary?.approved ?? 0,
    currency: "GHS",
  };
}

router.get(
  "/affiliate/overview",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    res.json(GetAffiliateOverviewResponse.parse(await affiliateView(user.id)));
  },
);

router.post(
  "/affiliate/apply",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const [existing] = await db
      .select()
      .from(affiliateProfilesTable)
      .where(eq(affiliateProfilesTable.userId, user.id))
      .limit(1);
    if (!existing) {
      await db.insert(affiliateProfilesTable).values({
        userId: user.id,
        status: "pending",
      });
    }
    res.status(201).json(
      ApplyForAffiliateResponse.parse(await affiliateView(user.id)),
    );
  },
);

router.get(
  "/affiliate/links",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const [profile] = await db
      .select()
      .from(affiliateProfilesTable)
      .where(eq(affiliateProfilesTable.userId, user.id))
      .limit(1);
    if (!profile) {
      res.json(ListAffiliateLinksResponse.parse([]));
      return;
    }
    const rows = await db
      .select({
        link: affiliateLinksTable,
        productTitle: productsTable.title,
      })
      .from(affiliateLinksTable)
      .innerJoin(
        productsTable,
        eq(affiliateLinksTable.productId, productsTable.id),
      )
      .where(eq(affiliateLinksTable.affiliateId, profile.id))
      .orderBy(desc(affiliateLinksTable.createdAt));
    res.json(
      ListAffiliateLinksResponse.parse(
        rows.map(({ link, productTitle }) => ({
          id: link.id,
          productId: link.productId,
          productTitle,
          code: link.code,
          url: `/api/affiliate/r/${link.code}`,
          clickCount: link.clickCount,
          conversionCount: link.conversionCount,
        })),
      ),
    );
  },
);

router.post(
  "/affiliate/links",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = CreateAffiliateLinkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Choose a product to promote." });
      return;
    }
    const user = currentUser(res);
    const [profile] = await db
      .select()
      .from(affiliateProfilesTable)
      .where(
        and(
          eq(affiliateProfilesTable.userId, user.id),
          eq(affiliateProfilesTable.status, "approved"),
        ),
      )
      .limit(1);
    if (!profile) {
      res.status(403).json({
        error: "Affiliate access must be approved before creating tracking links.",
      });
      return;
    }
    const [product] = await db
      .select({
        product: productsTable,
        vendorStatus: vendorProfilesTable.status,
        membershipExpiresAt: vendorProfilesTable.membershipExpiresAt,
        categoryType: categoriesTable.scope,
      })
      .from(productsTable)
      .innerJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .innerJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .where(eq(productsTable.id, parsed.data.productId))
      .limit(1);
    if (
      !product ||
      product.product.status !== "published" ||
      product.vendorStatus !== "approved" ||
      !product.membershipExpiresAt ||
      product.membershipExpiresAt <= new Date() ||
      !product.product.affiliateEligible ||
      product.product.commissionRateBps <= 0 ||
      product.categoryType !== product.product.type
    ) {
      res.status(400).json({ error: "This product is not eligible for promotion." });
      return;
    }
    const code = randomUUID().replaceAll("-", "");
    const [link] = await db
      .insert(affiliateLinksTable)
      .values({
        affiliateId: profile.id,
        productId: product.product.id,
        code,
      })
      .returning();
    res.status(201).json(
      CreateAffiliateLinkResponse.parse({
        id: link.id,
        productId: link.productId,
        productTitle: product.product.title,
        code,
        url: `/api/affiliate/r/${code}`,
        clickCount: 0,
        conversionCount: 0,
      }),
    );
  },
);

router.get("/affiliate/r/:code", async (req, res): Promise<void> => {
  const code = typeof req.params.code === "string" ? req.params.code : "";
  if (!/^[a-f0-9]{32}$/i.test(code)) {
    res.status(404).send("Referral link not found.");
    return;
  }
  const [link] = await db
    .select()
    .from(affiliateLinksTable)
    .where(eq(affiliateLinksTable.code, code))
    .limit(1);
  if (!link) {
    res.status(404).send("Referral link not found.");
    return;
  }
  await db
    .update(affiliateLinksTable)
    .set({ clickCount: sql`${affiliateLinksTable.clickCount} + 1` })
    .where(eq(affiliateLinksTable.id, link.id));
  const basePath = process.env.APP_BASE_URL?.replace(/\/+$/, "") ?? "";
  res.redirect(302, `${basePath}/products/${link.productId}?ref=${link.code}`);
});

export default router;
