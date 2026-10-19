import { and, count, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  courseEnrolmentsTable,
  ordersTable,
  orderItemsTable,
  ticketsTable,
  usersTable,
} from "@workspace/db";
import {
  GetDashboardResponse,
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
} from "@workspace/api-zod";
import { currentUser, requireAuthenticated } from "../middlewares/taskpayAuth";

const router: IRouter = Router();

router.get("/me", requireAuthenticated, async (_req, res): Promise<void> => {
  const user = currentUser(res);
  res.json(
    GetMeResponse.parse({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      roles: user.roles,
      status: user.status,
    }),
  );
});

router.patch(
  "/me",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = UpdateMeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Profile details are invalid." });
      return;
    }
    const user = currentUser(res);
    const patch = {
      ...(parsed.data.fullName !== undefined
        ? { fullName: parsed.data.fullName.trim() }
        : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone } : {}),
    };
    const [updated] = await db
      .update(usersTable)
      .set(patch)
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json(
      UpdateMeResponse.parse({
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phone: updated.phone,
        avatarUrl: updated.avatarUrl,
        roles: updated.roles,
        status: updated.status,
      }),
    );
  },
);

router.get(
  "/dashboard",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const [
      [orderSummary],
      [courseSummary],
      [ticketSummary],
      recentRows,
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.id)),
      db
        .select({ value: count() })
        .from(courseEnrolmentsTable)
        .where(eq(courseEnrolmentsTable.userId, user.id)),
      db
        .select({ value: count() })
        .from(ticketsTable)
        .where(
          and(
            eq(ticketsTable.userId, user.id),
            eq(ticketsTable.paymentStatus, "paid"),
          ),
        ),
      db
        .select({
          order: ordersTable,
          itemCount: sql<number>`(
            select count(*)::int from taskpay_order_items
            where order_id = ${ordersTable.id}
          )`,
        })
        .from(ordersTable)
        .where(eq(ordersTable.userId, user.id))
        .orderBy(desc(ordersTable.createdAt))
        .limit(5),
    ]);

    res.json(
      GetDashboardResponse.parse({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          avatarUrl: user.avatarUrl,
          roles: user.roles,
          status: user.status,
        },
        orderCount: orderSummary?.value ?? 0,
        courseCount: courseSummary?.value ?? 0,
        ticketCount: ticketSummary?.value ?? 0,
        savedCount: 0,
        recentOrders: recentRows.map(({ order, itemCount }) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalMinor: order.totalMinor,
          currency: order.currency,
          itemCount,
          createdAt: order.createdAt,
        })),
      }),
    );
  },
);

export default router;
