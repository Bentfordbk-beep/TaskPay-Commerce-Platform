import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  categoriesTable,
  coursesTable,
  eventsTable,
  campaignsTable,
  productsTable,
  ticketTypesTable,
  usersTable,
  vendorProfilesTable,
} from "@workspace/db";
import {
  GetHomeSnapshotResponse,
  GetProductParams,
  GetProductResponse,
  ListCategoriesQueryParams,
  ListCategoriesResponse,
  ListProductsQueryParams,
  ListProductsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function serializeProduct(productId: string) {
  const [result] = await db
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
  if (!result) return null;
  return {
    ...result.product,
    categoryName: result.categoryName,
    vendorName: result.vendorName,
  };
}

async function getFeaturedProducts(type: "physical" | "digital") {
  const rows = await db
    .select({ product: productsTable, categoryName: categoriesTable.name, vendorName: vendorProfilesTable.storeName })
    .from(productsTable)
    .innerJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .innerJoin(
      vendorProfilesTable,
      eq(productsTable.vendorId, vendorProfilesTable.id),
    )
    .where(
      and(
        eq(productsTable.type, type),
        eq(productsTable.status, "published"),
        eq(vendorProfilesTable.status, "approved"),
      ),
    )
    .orderBy(desc(productsTable.createdAt))
    .limit(4);

  return rows.map((row) => ({
    ...row.product,
    categoryName: row.categoryName,
    vendorName: row.vendorName,
  }));
}

async function getPublicCourses() {
  const rows = await db
    .select({
      course: coursesTable,
      creatorName: sql<string>`coalesce(${usersTable.fullName}, 'TaskPay creator')`,
      lessonCount: sql<number>`(
        select count(*)::int from taskpay_course_lessons
        where course_id = ${coursesTable.id}
      )`,
    })
    .from(coursesTable)
    .innerJoin(usersTable, eq(coursesTable.creatorId, usersTable.id))
    .where(eq(coursesTable.status, "published"))
    .orderBy(desc(coursesTable.createdAt))
    .limit(4);
  return rows.map((row) => ({
    ...row.course,
    creatorName: row.creatorName,
    lessonCount: row.lessonCount,
  }));
}

async function getPublicEvents() {
  const rows = await db
    .select({
      event: eventsTable,
      lowestPriceMinor: sql<number>`coalesce(min(${ticketTypesTable.priceMinor}), 0)::int`,
    })
    .from(eventsTable)
    .leftJoin(ticketTypesTable, eq(ticketTypesTable.eventId, eventsTable.id))
    .where(
      and(eq(eventsTable.status, "published"), sql`${eventsTable.startsAt} > now()`),
    )
    .groupBy(eventsTable.id)
    .orderBy(asc(eventsTable.startsAt))
    .limit(4);
  return rows.map((row) => ({
    ...row.event,
    lowestPriceMinor: row.lowestPriceMinor,
    currency: "GHS",
  }));
}

async function getPublicCampaigns() {
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.status, "open"))
    .orderBy(desc(campaignsTable.createdAt))
    .limit(4);
  return rows;
}

router.get("/home", async (_req, res): Promise<void> => {
  const [featuredPhysical, featuredDigital, categories, courses, events, campaigns] =
    await Promise.all([
      getFeaturedProducts("physical"),
      getFeaturedProducts("digital"),
      db.select().from(categoriesTable).orderBy(asc(categoriesTable.name)),
      getPublicCourses(),
      getPublicEvents(),
      getPublicCampaigns(),
    ]);

  const categoryRows = await Promise.all(
    categories.map(async (category) => {
      const [result] = await db
        .select({ value: count() })
        .from(productsTable)
        .where(eq(productsTable.categoryId, category.id));
      return { ...category, productCount: result?.value ?? 0 };
    }),
  );

  res.json(
    GetHomeSnapshotResponse.parse({
      featuredPhysical,
      featuredDigital,
      categories: categoryRows,
      courses,
      events,
      campaigns,
      paymentStatus: "unconfigured",
    }),
  );
});

router.get("/categories", async (req, res): Promise<void> => {
  const query = ListCategoriesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Choose a valid category type." });
    return;
  }

  const categories = await db
    .select()
    .from(categoriesTable)
    .where(eq(categoriesTable.scope, query.data.type))
    .orderBy(asc(categoriesTable.name));

  const result = await Promise.all(
    categories.map(async (category) => {
      const [products] = await db
        .select({ value: count() })
        .from(productsTable)
        .where(eq(productsTable.categoryId, category.id));
      return { ...category, productCount: products?.value ?? 0 };
    }),
  );
  res.json(ListCategoriesResponse.parse(result));
});

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Product filters are invalid." });
    return;
  }
  const { type, categoryId, search, sort, page = 1, pageSize = 12 } = parsed.data;
  const filters = [
    eq(productsTable.type, type),
    eq(productsTable.status, "published"),
    eq(vendorProfilesTable.status, "approved"),
  ];
  if (categoryId) filters.push(eq(productsTable.categoryId, categoryId));
  if (search?.trim()) {
    const query = `%${search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    filters.push(ilike(productsTable.title, query));
  }

  const orderBy =
    sort === "price-low"
      ? asc(productsTable.priceMinor)
      : sort === "price-high"
        ? desc(productsTable.priceMinor)
        : desc(productsTable.createdAt);

  const [rows, [total]] = await Promise.all([
    db
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
      .where(and(...filters))
      .orderBy(orderBy)
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ value: count() })
      .from(productsTable)
      .innerJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(and(...filters)),
  ]);

  res.json(
    ListProductsResponse.parse({
      items: rows.map((row) => ({
        ...row.product,
        categoryName: row.categoryName,
        vendorName: row.vendorName,
      })),
      page,
      pageSize,
      total: total?.value ?? 0,
    }),
  );
});

router.get("/products/:productId", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Product ID is invalid." });
    return;
  }
  const product = await serializeProduct(params.data.productId);
  if (!product || product.status !== "published") {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const [vendor] = await db
    .select({ status: vendorProfilesTable.status })
    .from(vendorProfilesTable)
    .where(eq(vendorProfilesTable.id, product.vendorId))
    .limit(1);
  if (vendor?.status !== "approved") {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  res.json(GetProductResponse.parse(product));
});

export default router;
