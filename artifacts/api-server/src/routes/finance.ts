import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  ledgerEntriesTable,
  payoutRequestsTable,
  platformSettingsTable,
  supportRequestsTable,
} from "@workspace/db";
import {
  CreateSupportRequestBody,
  CreateSupportRequestResponse,
  GetWalletResponse,
  RequestPayoutBody,
  RequestPayoutResponse,
} from "@workspace/api-zod";
import { currentUser, requireAuthenticated } from "../middlewares/taskpayAuth";

const router: IRouter = Router();

router.get(
  "/wallet",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const [[balances], payouts] = await Promise.all([
      db
        .select({
          available: sql<number>`coalesce(sum(case when status = 'available' then amount_minor else 0 end), 0)::int`,
          pending: sql<number>`coalesce(sum(case when status = 'pending' then amount_minor else 0 end), 0)::int`,
        })
        .from(ledgerEntriesTable)
        .where(eq(ledgerEntriesTable.userId, user.id)),
      db
        .select()
        .from(payoutRequestsTable)
        .where(eq(payoutRequestsTable.userId, user.id))
        .orderBy(desc(payoutRequestsTable.createdAt)),
    ]);

    const activePayouts = payouts
      .filter((payout) => ["pending", "approved"].includes(payout.status))
      .reduce((sum, payout) => sum + payout.amountMinor, 0);

    res.json(
      GetWalletResponse.parse({
        availableMinor: Math.max(0, (balances?.available ?? 0) - activePayouts),
        pendingMinor: balances?.pending ?? 0,
        currency: "GHS",
        payouts: payouts.map((payout) => ({
          id: payout.id,
          amountMinor: payout.amountMinor,
          currency: payout.currency,
          status: payout.status,
          createdAt: payout.createdAt,
        })),
      }),
    );
  },
);

router.post(
  "/payout-requests",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = RequestPayoutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Payout request details are invalid." });
      return;
    }
    const user = currentUser(res);
    const destination = parsed.data.destination?.trim();
    if (!destination) {
      res.status(400).json({
        error: "Add a payout destination before requesting a withdrawal.",
      });
      return;
    }

    const [settings] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.id, "primary"))
      .limit(1);
    const [balance] = await db
      .select({
        available: sql<number>`coalesce(sum(case when status = 'available' then amount_minor else 0 end), 0)::int`,
      })
      .from(ledgerEntriesTable)
      .where(eq(ledgerEntriesTable.userId, user.id));
    const [activePayouts] = await db
      .select({
        value: sql<number>`coalesce(sum(amount_minor), 0)::int`,
      })
      .from(payoutRequestsTable)
      .where(
        and(
          eq(payoutRequestsTable.userId, user.id),
          sql`${payoutRequestsTable.status} in ('pending', 'approved')`,
        ),
      );
    const available =
      (balance?.available ?? 0) - (activePayouts?.value ?? 0);
    if (parsed.data.amountMinor < (settings?.minimumPayoutMinor ?? 5000)) {
      res.status(400).json({
        error: `Minimum payout is ${(settings?.minimumPayoutMinor ?? 5000) / 100} GHS.`,
      });
      return;
    }
    if (parsed.data.amountMinor > available) {
      res.status(400).json({
        error: "The requested amount is above your verified available balance.",
      });
      return;
    }

    const [payout] = await db
      .insert(payoutRequestsTable)
      .values({
        userId: user.id,
        amountMinor: parsed.data.amountMinor,
        method: parsed.data.method,
        destination,
        currency: settings?.currency ?? "GHS",
        status: "pending",
      })
      .returning();
    res.status(201).json(
      RequestPayoutResponse.parse({
        id: payout.id,
        amountMinor: payout.amountMinor,
        currency: payout.currency,
        status: payout.status,
        createdAt: payout.createdAt,
      }),
    );
  },
);

router.post(
  "/support-requests",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = CreateSupportRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Support request details are invalid." });
      return;
    }
    const user = currentUser(res);
    const [supportRequest] = await db
      .insert(supportRequestsTable)
      .values({
        userId: user.id,
        subject: parsed.data.subject.trim(),
        message: parsed.data.message.trim(),
        status: "open",
      })
      .returning();
    res.status(201).json(
      CreateSupportRequestResponse.parse(supportRequest),
    );
  },
);

export default router;
