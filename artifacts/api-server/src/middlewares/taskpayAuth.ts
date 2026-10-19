import { clerkClient, getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { eq } from "drizzle-orm";
import {
  adminAuditLogsTable,
  db,
  platformSettingsTable,
  usersTable,
  type User,
} from "@workspace/db";

declare global {
  namespace Express {
    interface Locals {
      taskpayUser?: User;
    }
  }
}

export const requireAuthenticated: RequestHandler = async (
  req,
  res,
  next,
): Promise<void> => {
  try {
    const clerkUserId = getAuth(req).userId;
    if (!clerkUserId) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }

    const identity = await clerkClient.users.getUser(clerkUserId);
    const primaryEmail = identity.emailAddresses.find(
      (item) => item.id === identity.primaryEmailAddressId,
    );
    if (
      !primaryEmail?.emailAddress ||
      primaryEmail.verification?.status !== "verified"
    ) {
      res.status(403).json({ error: "A verified email address is required." });
      return;
    }

    const email = primaryEmail.emailAddress.trim().toLowerCase();
    const fullName = [identity.firstName, identity.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    let [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.clerkUserId, clerkUserId))
      .limit(1);

    if (!user) {
      [user] = await db
        .insert(usersTable)
        .values({
          clerkUserId,
          email,
          fullName: fullName || email.split("@")[0] || "TaskPay member",
          avatarUrl: identity.imageUrl || null,
        })
        .onConflictDoNothing({ target: usersTable.clerkUserId })
        .returning();
      if (!user) {
        [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.clerkUserId, clerkUserId))
          .limit(1);
      }
    }

    if (!user) {
      res.status(500).json({ error: "Unable to load the account profile." });
      return;
    }

    await db
      .insert(platformSettingsTable)
      .values({ id: "primary" })
      .onConflictDoNothing();

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (adminEmail && adminEmail === email) {
      user = await db.transaction(async (tx) => {
        const [settings] = await tx
          .select()
          .from(platformSettingsTable)
          .where(eq(platformSettingsTable.id, "primary"))
          .for("update");

        if (!settings || settings.adminBootstrapComplete) {
          const [freshUser] = await tx
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1);
          return freshUser ?? user;
        }

        const roles = [...new Set([...user.roles, "admin"])];
        const [promoted] = await tx
          .update(usersTable)
          .set({ roles })
          .where(eq(usersTable.id, user.id))
          .returning();

        await tx
          .update(platformSettingsTable)
          .set({ adminBootstrapComplete: true })
          .where(eq(platformSettingsTable.id, "primary"));

        await tx.insert(adminAuditLogsTable).values({
          actorUserId: user.id,
          action: "initial_admin_bootstrap",
          targetType: "user",
          targetId: user.id,
          reason: "Verified account matched the configured ADMIN_EMAIL.",
        });
        return promoted ?? user;
      });
    }

    if (user.status !== "active") {
      res.status(403).json({ error: "This account is suspended." });
      return;
    }

    res.locals.taskpayUser = user;
    next();
  } catch (error) {
    req.log.error({ err: error }, "TaskPay authentication failed");
    res.status(401).json({ error: "Unable to verify your account." });
  }
};

export const requireAdministrator: RequestHandler = (_req, res, next) => {
  const user = res.locals.taskpayUser;
  if (!user?.roles.includes("admin")) {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }
  next();
};

export const requireSameOrigin: RequestHandler = (req, res, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    next();
    return;
  }

  if (req.get("sec-fetch-site") === "cross-site") {
    res.status(403).json({ error: "Cross-site requests are not allowed." });
    return;
  }

  const origin = req.get("origin");
  if (origin) {
    try {
      const originHost = new URL(origin).host.toLowerCase();
      const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
      const requestHost = (forwardedHost || req.get("host") || "").toLowerCase();
      if (!requestHost || originHost !== requestHost) {
        res.status(403).json({ error: "Request origin is not allowed." });
        return;
      }
    } catch {
      res.status(403).json({ error: "Request origin is not valid." });
      return;
    }
  }
  next();
};

export function currentUser(res: Parameters<RequestHandler>[1]): User {
  const user = res.locals.taskpayUser;
  if (!user) throw new Error("Authenticated user context is missing.");
  return user;
}
