import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  campaignApplicationsTable,
  campaignsTable,
  categoriesTable,
  courseEnrolmentsTable,
  courseLessonsTable,
  coursesTable,
  db,
  eventsTable,
  platformSettingsTable,
  ticketTypesTable,
  ticketsTable,
  usersTable,
} from "@workspace/db";
import {
  ApplyToCampaignParams,
  ApplyToCampaignResponse,
  CreateCampaignBody,
  CreateCampaignResponse,
  CreateCourseBody,
  CreateCourseResponse,
  CreateEventBody,
  CreateEventResponse,
  EnrolInCourseParams,
  EnrolInCourseResponse,
  GetCourseParams,
  GetCourseResponse,
  ListCampaignsQueryParams,
  ListCampaignsResponse,
  ListEventsQueryParams,
  ListEventsResponse,
  ListMyCampaignSubmissionsResponse,
  ListMyEnrolmentsResponse,
  ListMyTicketsResponse,
  ListCoursesQueryParams,
  ListCoursesResponse,
  PurchaseTicketBody,
  PurchaseTicketParams,
  SubmitCampaignWorkBody,
  SubmitCampaignWorkResponse,
} from "@workspace/api-zod";
import { currentUser, requireAuthenticated } from "../middlewares/taskpayAuth";

const router: IRouter = Router();

async function courseView(courseId: string) {
  const [row] = await db
    .select({
      course: coursesTable,
      creatorName: usersTable.fullName,
      lessonCount: sql<number>`(
        select count(*)::int from taskpay_course_lessons
        where course_id = ${coursesTable.id}
      )`,
    })
    .from(coursesTable)
    .innerJoin(usersTable, eq(coursesTable.creatorId, usersTable.id))
    .where(eq(coursesTable.id, courseId))
    .limit(1);
  if (!row) return null;
  return {
    ...row.course,
    creatorName: row.creatorName,
    lessonCount: row.lessonCount,
  };
}

router.get("/courses", async (req, res): Promise<void> => {
  const parsed = ListCoursesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Course filters are invalid." });
    return;
  }
  const filters = [eq(coursesTable.status, "published")];
  if (parsed.data.categoryId) {
    filters.push(eq(coursesTable.categoryId, parsed.data.categoryId));
  }
  if (parsed.data.search?.trim()) {
    const search = `%${parsed.data.search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    filters.push(ilike(coursesTable.title, search));
  }
  const rows = await db
    .select({
      course: coursesTable,
      creatorName: usersTable.fullName,
      lessonCount: sql<number>`(
        select count(*)::int from taskpay_course_lessons
        where course_id = ${coursesTable.id}
      )`,
    })
    .from(coursesTable)
    .innerJoin(usersTable, eq(coursesTable.creatorId, usersTable.id))
    .where(and(...filters))
    .orderBy(desc(coursesTable.createdAt));

  res.json(
    ListCoursesResponse.parse(
      rows.map((row) => ({
        ...row.course,
        creatorName: row.creatorName,
        lessonCount: row.lessonCount,
      })),
    ),
  );
});

router.get("/courses/:courseId", async (req, res): Promise<void> => {
  const params = GetCourseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Course ID is invalid." });
    return;
  }
  const course = await courseView(params.data.courseId);
  if (!course || course.status !== "published") {
    res.status(404).json({ error: "Course not found." });
    return;
  }
  res.json(GetCourseResponse.parse(course));
});

router.post(
  "/courses",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = CreateCourseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Course details are invalid." });
      return;
    }
    const user = currentUser(res);
    const [category] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, parsed.data.categoryId))
      .limit(1);
    if (!category || category.scope !== "course") {
      res.status(400).json({ error: "Choose a learning category." });
      return;
    }
    const imageUrl = parsed.data.imageUrl;
    if (imageUrl) {
      try {
        if (!["https:", "http:"].includes(new URL(imageUrl).protocol)) {
          throw new Error("invalid scheme");
        }
      } catch {
        res.status(400).json({ error: "Course image URL must use HTTP or HTTPS." });
        return;
      }
    }

    const [course] = await db
      .insert(coursesTable)
      .values({
        creatorId: user.id,
        title: parsed.data.title.trim(),
        description: parsed.data.description.trim(),
        imageUrl: imageUrl ?? null,
        priceMinor: parsed.data.priceMinor,
        categoryId: parsed.data.categoryId,
        status: "pending",
      })
      .returning();
    const roles = [...new Set([...user.roles, "course_creator"])];
    await db
      .update(usersTable)
      .set({ roles })
      .where(eq(usersTable.id, user.id));
    const view = await courseView(course.id);
    res.status(201).json(CreateCourseResponse.parse(view));
  },
);

router.post(
  "/courses/:courseId/enrol",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const params = EnrolInCourseParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Course ID is invalid." });
      return;
    }
    const user = currentUser(res);
    const [existing] = await db
      .select({
        enrolment: courseEnrolmentsTable,
        title: coursesTable.title,
      })
      .from(courseEnrolmentsTable)
      .innerJoin(
        coursesTable,
        eq(courseEnrolmentsTable.courseId, coursesTable.id),
      )
      .where(
        and(
          eq(courseEnrolmentsTable.userId, user.id),
          eq(courseEnrolmentsTable.courseId, params.data.courseId),
        ),
      )
      .limit(1);
    if (existing) {
      res.json(
        EnrolInCourseResponse.parse({
          id: existing.enrolment.id,
          courseId: existing.enrolment.courseId,
          courseTitle: existing.title,
          progressPercent: existing.enrolment.progressPercent,
          status: existing.enrolment.status,
        }),
      );
      return;
    }
    res.status(403).json({
      error:
        "Course access is granted only after a verified purchase. Course checkout is not configured yet.",
    });
  },
);

router.get(
  "/enrolments/me",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const rows = await db
      .select({
        enrolment: courseEnrolmentsTable,
        courseTitle: coursesTable.title,
      })
      .from(courseEnrolmentsTable)
      .innerJoin(
        coursesTable,
        eq(courseEnrolmentsTable.courseId, coursesTable.id),
      )
      .where(eq(courseEnrolmentsTable.userId, user.id))
      .orderBy(asc(courseEnrolmentsTable.createdAt));

    res.json(
      ListMyEnrolmentsResponse.parse(
        rows.map(({ enrolment, courseTitle }) => ({
          id: enrolment.id,
          courseId: enrolment.courseId,
          courseTitle,
          progressPercent: enrolment.progressPercent,
          status: enrolment.status,
        })),
      ),
    );
  },
);

router.get("/campaigns", async (req, res): Promise<void> => {
  const parsed = ListCampaignsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Campaign search is invalid." });
    return;
  }
  const filters = [eq(campaignsTable.status, "open")];
  if (parsed.data.search?.trim()) {
    const search = `%${parsed.data.search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    filters.push(ilike(campaignsTable.title, search));
  }
  const rows = await db
    .select()
    .from(campaignsTable)
    .where(and(...filters))
    .orderBy(desc(campaignsTable.createdAt));
  res.json(ListCampaignsResponse.parse(rows));
});

router.post(
  "/campaigns",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = CreateCampaignBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Campaign details are invalid." });
      return;
    }
    const user = currentUser(res);
    if (parsed.data.endDate < parsed.data.startDate) {
      res.status(400).json({ error: "Campaign end date must follow its start date." });
      return;
    }
    const [campaign] = await db
      .insert(campaignsTable)
      .values({
        ownerId: user.id,
        title: parsed.data.title.trim(),
        businessName: parsed.data.businessName.trim(),
        description: parsed.data.description.trim(),
        objective: parsed.data.objective.trim(),
        budgetMinor: parsed.data.budgetMinor,
        startDate: parsed.data.startDate.toISOString().slice(0, 10),
        endDate: parsed.data.endDate.toISOString().slice(0, 10),
        status: "pending_review",
      })
      .returning();
    res.status(201).json(CreateCampaignResponse.parse(campaign));
  },
);

router.post(
  "/campaigns/:campaignId/apply",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const params = ApplyToCampaignParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Campaign ID is invalid." });
      return;
    }
    const user = currentUser(res);
    const [campaign] = await db
      .select()
      .from(campaignsTable)
      .where(
        and(
          eq(campaignsTable.id, params.data.campaignId),
          eq(campaignsTable.status, "open"),
        ),
      )
      .limit(1);
    if (!campaign) {
      res.status(404).json({ error: "This campaign is not open for applications." });
      return;
    }
    if (campaign.ownerId === user.id) {
      res.status(400).json({ error: "You cannot apply to your own campaign." });
      return;
    }

    const [application] = await db
      .insert(campaignApplicationsTable)
      .values({
        campaignId: campaign.id,
        promoterId: user.id,
        // Open campaigns accept eligible applications immediately for this MVP.
        // Submissions remain reviewable and do not create a payout.
        status: "accepted",
      })
      .onConflictDoNothing({
        target: [
          campaignApplicationsTable.campaignId,
          campaignApplicationsTable.promoterId,
        ],
      })
      .returning();
    if (!application) {
      res.status(409).json({ error: "You have already applied to this campaign." });
      return;
    }
    res.status(201).json(
      ApplyToCampaignResponse.parse({
        ...application,
        campaignTitle: campaign.title,
      }),
    );
  },
);

router.get(
  "/campaign-submissions",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const rows = await db
      .select({
        application: campaignApplicationsTable,
        campaignTitle: campaignsTable.title,
      })
      .from(campaignApplicationsTable)
      .innerJoin(
        campaignsTable,
        eq(campaignApplicationsTable.campaignId, campaignsTable.id),
      )
      .where(eq(campaignApplicationsTable.promoterId, user.id))
      .orderBy(desc(campaignApplicationsTable.submittedAt));
    res.json(
      ListMyCampaignSubmissionsResponse.parse(
        rows.map(({ application, campaignTitle }) => ({
          ...application,
          campaignTitle,
        })),
      ),
    );
  },
);

router.post(
  "/campaign-submissions",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = SubmitCampaignWorkBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Submission details are invalid." });
      return;
    }
    const user = currentUser(res);
    try {
      if (!["https:", "http:"].includes(new URL(parsed.data.evidenceUrl).protocol)) {
        throw new Error("invalid scheme");
      }
    } catch {
      res.status(400).json({ error: "Evidence URL must use HTTP or HTTPS." });
      return;
    }
    const [application] = await db
      .select({
        application: campaignApplicationsTable,
        title: campaignsTable.title,
      })
      .from(campaignApplicationsTable)
      .innerJoin(
        campaignsTable,
        eq(campaignApplicationsTable.campaignId, campaignsTable.id),
      )
      .where(
        and(
          eq(campaignApplicationsTable.id, parsed.data.applicationId),
          eq(campaignApplicationsTable.promoterId, user.id),
          eq(campaignApplicationsTable.status, "accepted"),
        ),
      )
      .limit(1);
    if (!application) {
      res.status(404).json({ error: "Accepted campaign application not found." });
      return;
    }
    const [updated] = await db
      .update(campaignApplicationsTable)
      .set({
        evidenceUrl: parsed.data.evidenceUrl,
        notes: parsed.data.notes,
        status: "submitted",
        submittedAt: new Date(),
      })
      .where(eq(campaignApplicationsTable.id, application.application.id))
      .returning();
    res.status(201).json(
      SubmitCampaignWorkResponse.parse({
        ...updated,
        campaignTitle: application.title,
      }),
    );
  },
);

router.get("/events", async (req, res): Promise<void> => {
  const parsed = ListEventsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Event filters are invalid." });
    return;
  }
  const filters = [
    eq(eventsTable.status, "published"),
    sql`${eventsTable.startsAt} > now()`,
  ];
  if (parsed.data.categoryId) {
    filters.push(eq(eventsTable.categoryId, parsed.data.categoryId));
  }
  if (parsed.data.search?.trim()) {
    const search = `%${parsed.data.search.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    filters.push(ilike(eventsTable.title, search));
  }
  const rows = await db
    .select({
      event: eventsTable,
      lowestPriceMinor: sql<number>`coalesce(min(${ticketTypesTable.priceMinor}), 0)::int`,
    })
    .from(eventsTable)
    .leftJoin(ticketTypesTable, eq(ticketTypesTable.eventId, eventsTable.id))
    .where(and(...filters))
    .groupBy(eventsTable.id)
    .orderBy(asc(eventsTable.startsAt));
  res.json(
    ListEventsResponse.parse(
      rows.map((row) => ({
        ...row.event,
        lowestPriceMinor: row.lowestPriceMinor,
        currency: "GHS",
      })),
    ),
  );
});

router.post(
  "/events",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const parsed = CreateEventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Event details are invalid." });
      return;
    }
    const user = currentUser(res);
    const [category] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, parsed.data.categoryId))
      .limit(1);
    if (!category || category.scope !== "event") {
      res.status(400).json({ error: "Choose an event category." });
      return;
    }
    if (new Date(parsed.data.startsAt) <= new Date()) {
      res.status(400).json({ error: "Event date must be in the future." });
      return;
    }
    const imageUrl = parsed.data.imageUrl;
    if (imageUrl) {
      try {
        if (!["https:", "http:"].includes(new URL(imageUrl).protocol)) {
          throw new Error("invalid scheme");
        }
      } catch {
        res.status(400).json({ error: "Event image URL must use HTTP or HTTPS." });
        return;
      }
    }

    const [settings] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.id, "primary"))
      .limit(1);
    const created = await db.transaction(async (tx) => {
      const [event] = await tx
        .insert(eventsTable)
        .values({
          organiserId: user.id,
          title: parsed.data.title.trim(),
          description: parsed.data.description.trim(),
          categoryId: parsed.data.categoryId,
          imageUrl: imageUrl ?? null,
          venue: parsed.data.venue.trim(),
          city: parsed.data.city.trim(),
          country: parsed.data.country.trim(),
          startsAt: new Date(parsed.data.startsAt),
          status: "pending",
        })
        .returning();
      await tx.insert(ticketTypesTable).values({
        eventId: event.id,
        name: parsed.data.ticketName.trim(),
        priceMinor: parsed.data.ticketPriceMinor,
        currency: settings?.currency ?? "GHS",
        quantityAvailable: parsed.data.ticketQuantity,
      });
      const roles = [...new Set([...user.roles, "event_organiser"])];
      await tx
        .update(usersTable)
        .set({ roles })
        .where(eq(usersTable.id, user.id));
      return event;
    });

    const [ticket] = await db
      .select()
      .from(ticketTypesTable)
      .where(eq(ticketTypesTable.eventId, created.id))
      .limit(1);
    res.status(201).json(
      CreateEventResponse.parse({
        ...created,
        lowestPriceMinor: ticket?.priceMinor ?? 0,
        currency: ticket?.currency ?? "GHS",
      }),
    );
  },
);

router.post(
  "/events/:eventId/tickets",
  requireAuthenticated,
  async (req, res): Promise<void> => {
    const params = PurchaseTicketParams.safeParse(req.params);
    const parsed = PurchaseTicketBody.safeParse(req.body);
    if (!params.success || !parsed.success) {
      res.status(400).json({ error: "Ticket request is invalid." });
      return;
    }
    // No inventory is reserved and no ticket is issued until a payment provider
    // is connected and its server-side verification is implemented.
    res.status(503).json({
      error:
        "Ticket checkout is not configured yet. No tickets were reserved or issued.",
      code: "PAYMENTS_NOT_CONFIGURED",
    });
  },
);

router.get(
  "/tickets/me",
  requireAuthenticated,
  async (_req, res): Promise<void> => {
    const user = currentUser(res);
    const rows = await db
      .select({
        ticket: ticketsTable,
        eventTitle: eventsTable.title,
      })
      .from(ticketsTable)
      .innerJoin(eventsTable, eq(ticketsTable.eventId, eventsTable.id))
      .where(
        and(
          eq(ticketsTable.userId, user.id),
          eq(ticketsTable.paymentStatus, "paid"),
        ),
      );
    res.json(
      ListMyTicketsResponse.parse(
        rows.map(({ ticket, eventTitle }) => ({
          id: ticket.id,
          eventId: ticket.eventId,
          eventTitle,
          status: "valid",
          ticketIdentifier: ticket.ticketIdentifier,
          qrData: ticket.qrData,
        })),
      ),
    );
  },
);

export default router;
