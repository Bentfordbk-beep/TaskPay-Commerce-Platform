import { and, asc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  categoriesTable,
  db,
  platformSettingsTable,
  productsTable,
  vendorProfilesTable,
} from "@workspace/db";
import {
  ApplyAsVendorBody,
  ApplyAsVendorResponse,
  ArchiveProductParams,
  CreateProductBody,
  CreateProductResponse,
  GetMyVendorResponse,
  ListMyProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import { currentUser, requireAuthenticated } from "../middlewares/taskpayAuth";

const router: IRouter = Router();

function isSafeWebUrl(value: string | null | undefined): boolean {
  if (!value) return true;
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function getOwnedVendor(userId: string) {
  const [vendor] = await db
    .select()
    .from(vendorProfilesTable)
    .where(eq(vendorProfilesTable.userId, userId))
    .limit(1);
  return vendor;
}

async function getProductView(productId: string) {
  const [row] = await db
    .select({
      product: productsTable,
      categoryName: categoriesTable.name,
      vendorName: vendorProfilesTable.storeName,
    })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(
      vendorProfilesTable,
      eq(productsTable.vendorId, vendorProfilesTable.id),
    )
    .where(eq(productsTable.id, productId))
    .limit(1);
  if (!row) return null;
  return {
    ...row.product,
    categoryName: row.categoryName,
    vendorName: row.vendorName,
  };
}

router.get(
  "/vendors/me",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const vendor = await getOwnedVendor(user.id);
    if (!vendor) {
      res.status(404).json({ error: "No vendor application was found." });
      return;
    }
    res.json(GetMyVendorResponse.parse(vendor));
  },
);

router.post(
  "/vendors/me",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = ApplyAsVendorBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Vendor application details are invalid." });
      return;
    }
    const user = currentUser(res);
    if (!isSafeWebUrl(parsed.data.logoUrl)) {
      res.status(400).json({ error: "Store image must use an HTTP or HTTPS URL." });
      return;
    }

    const existing = await getOwnedVendor(user.id);
    if (existing?.status === "approved" || existing?.status === "suspended") {
      res.status(409).json({ error: "This account already has a vendor store." });
      return;
    }

    const values = {
      storeName: parsed.data.storeName.trim(),
      description: parsed.data.description.trim(),
      country: parsed.data.country.trim(),
      city: parsed.data.city.trim(),
      logoUrl: parsed.data.logoUrl ?? null,
      contactPhone: parsed.data.contactPhone.trim(),
      status: "pending",
    };
    const [vendor] = existing
      ? await db
          .update(vendorProfilesTable)
          .set(values)
          .where(eq(vendorProfilesTable.id, existing.id))
          .returning()
      : await db
          .insert(vendorProfilesTable)
          .values({ ...values, userId: user.id })
          .returning();
    res.status(201).json(ApplyAsVendorResponse.parse(vendor));
  },
);

router.get(
  "/vendors/me/products",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const vendor = await getOwnedVendor(user.id);
    if (!vendor) {
      res.json(ListMyProductsResponse.parse([]));
      return;
    }

    const rows = await db
      .select({
        product: productsTable,
        categoryName: categoriesTable.name,
        vendorName: vendorProfilesTable.storeName,
      })
      .from(productsTable)
      .innerJoin(
        categoriesTable,
        eq(productsTable.categoryId, categoriesTable.id),
      )
      .innerJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(eq(productsTable.vendorId, vendor.id))
      .orderBy(asc(productsTable.createdAt));

    res.json(
      ListMyProductsResponse.parse(
        rows.map((row) => ({
          ...row.product,
          categoryName: row.categoryName,
          vendorName: row.vendorName,
        })),
      ),
    );
  },
);

router.post(
  "/products",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = CreateProductBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Product details are invalid." });
      return;
    }
    const user = currentUser(res);
    const vendor = await getOwnedVendor(user.id);
    if (!vendor || vendor.status !== "approved") {
      res.status(403).json({ error: "An approved vendor store is required." });
      return;
    }
    if (!vendor.membershipExpiresAt || vendor.membershipExpiresAt <= new Date()) {
      res.status(403).json({ error: "An active vendor membership is required." });
      return;
    }

    const data = parsed.data;
    if (!isSafeWebUrl(data.imageUrl)) {
      res.status(400).json({ error: "Product image must use an HTTP or HTTPS URL." });
      return;
    }
    if (data.salePriceMinor != null && data.salePriceMinor >= data.priceMinor) {
      res.status(400).json({ error: "Sale price must be lower than the regular price." });
      return;
    }
    if (data.type === "physical" && data.stockQuantity == null) {
      res.status(400).json({ error: "Physical products need a stock quantity." });
      return;
    }
    if (data.type === "digital" && (data.stockQuantity != null || data.deliverySummary)) {
      res.status(400).json({ error: "Digital products cannot have stock or shipping details." });
      return;
    }

    const [category] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, data.categoryId))
      .limit(1);
    if (!category || category.scope !== data.type) {
      res.status(400).json({ error: "Choose a category for this product type." });
      return;
    }

    const [product] = await db
      .insert(productsTable)
      .values({
        vendorId: vendor.id,
        title: data.title.trim(),
        description: data.description.trim(),
        type: data.type,
        categoryId: data.categoryId,
        priceMinor: data.priceMinor,
        salePriceMinor: data.salePriceMinor ?? null,
        imageUrl: data.imageUrl ?? null,
        stockQuantity: data.type === "physical" ? (data.stockQuantity ?? 0) : null,
        condition: data.type === "physical" ? (data.condition ?? null) : null,
        deliverySummary:
          data.type === "physical" ? (data.deliverySummary ?? null) : null,
        affiliateEligible: data.affiliateEligible ?? false,
        commissionRateBps: data.affiliateEligible
          ? (data.commissionRateBps ?? 0)
          : 0,
        status: "pending",
      })
      .returning();

    const view = await getProductView(product.id);
    res.status(201).json(CreateProductResponse.parse(view));
  },
);

router.patch(
  "/products/:productId",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const params = UpdateProductParams.safeParse(req.params);
    const parsed = UpdateProductBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Product update is invalid." });
      return;
    }
    const user = currentUser(res);
    const [owned] = await db
      .select({ product: productsTable })
      .from(productsTable)
      .innerJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(
        and(
          eq(productsTable.id, params.data.productId),
          eq(vendorProfilesTable.userId, user.id),
        ),
      )
      .limit(1);
    if (!owned) {
      res.status(404).json({ error: "Product not found." });
      return;
    }

    const data = parsed.data;
    if (!isSafeWebUrl(data.imageUrl)) {
      res.status(400).json({ error: "Product image must use an HTTP or HTTPS URL." });
      return;
    }
    if (data.categoryId) {
      const [category] = await db
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.id, data.categoryId))
        .limit(1);
      if (!category || category.scope !== owned.product.type) {
        res.status(400).json({ error: "Choose a category for this product type." });
        return;
      }
    }
    const regularPrice = data.priceMinor ?? owned.product.priceMinor;
    if (
      data.salePriceMinor != null &&
      data.salePriceMinor >= regularPrice
    ) {
      res.status(400).json({ error: "Sale price must be lower than the regular price." });
      return;
    }

    const update = {
      ...data,
      ...(data.title !== undefined ? { title: data.title.trim() } : {}),
      ...(data.description !== undefined
        ? { description: data.description.trim() }
        : {}),
      ...(data.affiliateEligible === false ? { commissionRateBps: 0 } : {}),
    };
    const [updated] = await db
      .update(productsTable)
      .set(update)
      .where(eq(productsTable.id, owned.product.id))
      .returning();
    const view = await getProductView(updated.id);
    res.json(UpdateProductResponse.parse(view));
  },
);

router.delete(
  "/products/:productId",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const params = ArchiveProductParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Product ID is invalid." });
      return;
    }
    const user = currentUser(res);
    const [updated] = await db
      .update(productsTable)
      .set({ status: "archived" })
      .where(
        and(
          eq(productsTable.id, params.data.productId),
          eq(
            productsTable.vendorId,
            db
              .select({ id: vendorProfilesTable.id })
              .from(vendorProfilesTable)
              .where(eq(vendorProfilesTable.userId, user.id)),
          ),
        ),
      )
      .returning({ id: productsTable.id });
    if (!updated) {
      res.status(404).json({ error: "Product not found." });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
