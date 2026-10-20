import { and, count, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  cartItemsTable,
  cartsTable,
  categoriesTable,
  db,
  ordersTable,
  orderItemsTable,
  productsTable,
  vendorProfilesTable,
} from "@workspace/db";
import {
  AddCartItemBody,
  AddCartItemResponse,
  BeginCheckoutBody,
  GetCartResponse,
  ListMyOrdersResponse,
  RemoveCartItemParams,
  RemoveCartItemResponse,
} from "@workspace/api-zod";
import { currentUser, requireAuthenticated } from "../middlewares/taskpayAuth";

const router: IRouter = Router();

async function getOrCreateCart(userId: string) {
  const [existing] = await db
    .select()
    .from(cartsTable)
    .where(eq(cartsTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(cartsTable)
    .values({ userId })
    .onConflictDoNothing({ target: cartsTable.userId })
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(cartsTable)
    .where(eq(cartsTable.userId, userId))
    .limit(1);
  if (!raced) throw new Error("Unable to load the cart.");
  return raced;
}

async function readCart(userId: string) {
  const [cart] = await db
    .select()
    .from(cartsTable)
    .where(eq(cartsTable.userId, userId))
    .limit(1);
  if (!cart) return { items: [], subtotalMinor: 0, currency: "GHS" };

  const rows = await db
    .select({
      item: cartItemsTable,
      product: productsTable,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.cartId, cart.id))
    .orderBy(cartItemsTable.createdAt);
  const items = rows.map(({ item, product }) => ({
    id: item.id,
    productId: product.id,
    title: product.title,
    type: product.type,
    priceMinor: product.salePriceMinor ?? product.priceMinor,
    quantity: item.quantity,
    imageUrl: product.imageUrl,
  }));
  return {
    items,
    subtotalMinor: items.reduce(
      (sum, item) => sum + item.priceMinor * item.quantity,
      0,
    ),
    currency: "GHS",
  };
}

router.get(
  "/cart",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    res.json(GetCartResponse.parse(await readCart(user.id)));
  },
);

router.post(
  "/cart/items",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = AddCartItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Cart item details are invalid." });
      return;
    }
    const user = currentUser(res);
    const [result] = await db
      .select({
        product: productsTable,
        vendorStatus: vendorProfilesTable.status,
        membershipExpiresAt: vendorProfilesTable.membershipExpiresAt,
      })
      .from(productsTable)
      .innerJoin(
        vendorProfilesTable,
        eq(productsTable.vendorId, vendorProfilesTable.id),
      )
      .where(eq(productsTable.id, parsed.data.productId))
      .limit(1);
    if (
      !result ||
      result.product.status !== "published" ||
      result.vendorStatus !== "approved" ||
      !result.membershipExpiresAt ||
      result.membershipExpiresAt <= new Date()
    ) {
      res.status(404).json({ error: "This product is no longer available." });
      return;
    }
    if (
      result.product.type === "physical" &&
      (result.product.stockQuantity === null ||
        result.product.stockQuantity < parsed.data.quantity)
    ) {
      res.status(409).json({ error: "There is not enough stock for this item." });
      return;
    }

    const cart = await getOrCreateCart(user.id);
    const currentRows = await db
      .select({
        item: cartItemsTable,
        product: productsTable,
      })
      .from(cartItemsTable)
      .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
      .where(eq(cartItemsTable.cartId, cart.id));
    const incompatible = currentRows.some(
      ({ item, product }) =>
        item.productId !== result.product.id &&
        product.type !== result.product.type,
    );
    if (incompatible) {
      res.status(409).json({
        error:
          "Physical and digital items use separate checkouts. Finish or clear your current cart before adding this item.",
      });
      return;
    }
    const existing = currentRows.find(
      ({ item }) => item.productId === result.product.id,
    );
    const nextQuantity = (existing?.item.quantity ?? 0) + parsed.data.quantity;
    if (nextQuantity > 20) {
      res.status(400).json({ error: "A cart item cannot exceed 20 units." });
      return;
    }
    if (
      result.product.type === "physical" &&
      nextQuantity > (result.product.stockQuantity ?? 0)
    ) {
      res.status(409).json({ error: "There is not enough stock for this item." });
      return;
    }

    if (existing) {
      await db
        .update(cartItemsTable)
        .set({ quantity: nextQuantity })
        .where(eq(cartItemsTable.id, existing.item.id));
    } else {
      await db.insert(cartItemsTable).values({
        cartId: cart.id,
        productId: result.product.id,
        quantity: parsed.data.quantity,
      });
    }
    res.json(AddCartItemResponse.parse(await readCart(user.id)));
  },
);

router.delete(
  "/cart/items/:itemId",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const params = RemoveCartItemParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Cart item ID is invalid." });
      return;
    }
    const user = currentUser(res);
    await db
      .delete(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.id, params.data.itemId),
          eq(
            cartItemsTable.cartId,
            db
              .select({ id: cartsTable.id })
              .from(cartsTable)
              .where(eq(cartsTable.userId, user.id)),
          ),
        ),
      );
    res.json(RemoveCartItemResponse.parse(await readCart(user.id)));
  },
);

router.post(
  "/checkout",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = BeginCheckoutBody.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Delivery details are invalid." });
      return;
    }
    // A checkout must not create an order or claim a payment when no supported
    // provider has been configured and verified for this project.
    res.status(503).json({
      error:
        "Payments are not configured yet. Your cart is saved; no order or charge was created.",
      code: "PAYMENTS_NOT_CONFIGURED",
    });
  },
);

router.get(
  "/orders/me",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const rows = await db
      .select({
        order: ordersTable,
        itemCount: sql<number>`(
          select count(*)::int from taskpay_order_items
          where order_id = ${ordersTable.id}
        )`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.userId, user.id))
      .orderBy(desc(ordersTable.createdAt));

    res.json(
      ListMyOrdersResponse.parse(
        rows.map(({ order, itemCount }) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalMinor: order.totalMinor,
          currency: order.currency,
          itemCount,
          createdAt: order.createdAt,
        })),
      ),
    );
  },
);

export default router;
