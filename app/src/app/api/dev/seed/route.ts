import { NextResponse } from "next/server";
import { getPool, initDb } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin } from "@/lib/auth";
import { parseJsonBody } from "@/lib/validate";
import { errJson } from "@/lib/error-response";
import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;
const SEED_PASSWORD = "password123";

type SeedStatus = "Received" | "Preparing" | "Complete";

interface SeedOrderProfile {
  status: SeedStatus;
  receivedMinutesAgo: number;
  preparingMinutesAgo?: number;
  completeMinutesAgo?: number;
  acknowledgedMinutesAgo?: number;
  deletedMinutesAgo?: number;
}

interface SeedRestaurant {
  name: string;
  completeCapHours: number;
  orderNumbers: readonly string[];
}

const SEED_ORDER_PROFILES: readonly SeedOrderProfile[] = [
  { status: "Received", receivedMinutesAgo: 4 },
  { status: "Received", receivedMinutesAgo: 23 },
  { status: "Preparing", receivedMinutesAgo: 48, preparingMinutesAgo: 17 },
  { status: "Preparing", receivedMinutesAgo: 92, preparingMinutesAgo: 44 },
  { status: "Complete", receivedMinutesAgo: 76, preparingMinutesAgo: 49, completeMinutesAgo: 11 },
  {
    status: "Complete",
    receivedMinutesAgo: 172,
    preparingMinutesAgo: 138,
    completeMinutesAgo: 83,
    acknowledgedMinutesAgo: 37,
  },
  {
    status: "Complete",
    receivedMinutesAgo: 300,
    preparingMinutesAgo: 250,
    completeMinutesAgo: 200,
    acknowledgedMinutesAgo: 160,
    deletedMinutesAgo: 90,
  },
];

const SEED_RESTAURANTS: readonly SeedRestaurant[] = [
  {
    name: "The Golden Spoon",
    completeCapHours: 12,
    orderNumbers: ["Table 12", "Pager 047", "Pickup - Maya", "Online A184", "Booth 6", "Walk-in Jordan", "Patio 3"],
  },
  {
    name: "Harbor & Hearth",
    completeCapHours: 8,
    orderNumbers: ["Dock 4", "Pager 118", "Pickup - Ellis", "Online H552", "Table 21", "Walk-in Priya", "Patio 8"],
  },
  {
    name: "Green Fork Cafe",
    completeCapHours: 4,
    orderNumbers: ["Salad Bar 2", "Pager 204", "Pickup - Noah", "Online G731", "Table 5", "Walk-in Amara", "Counter 11"],
  },
  {
    name: "Midnight Noodles",
    completeCapHours: 2,
    orderNumbers: ["Noodle Bar 7", "Pager 315", "Pickup - Leo", "Online N909", "Booth 4", "Walk-in Sofia", "Late Night 22"],
  },
  {
    name: "Rosa's Kitchen",
    completeCapHours: 6,
    orderNumbers: ["Table 3", "Pager 411", "Pickup - Sam", "Online R208", "Booth 9", "Walk-in Aisha", "Catering C14"],
  },
];

function minutesBefore(reference: Date, minutes: number) {
  return new Date(reference.getTime() - minutes * 60_000);
}

export async function POST(request: Request) {
  logger.info("POST /api/dev/seed - request received");

  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await parseJsonBody(request);
    const confirmation = body && typeof body === "object"
      ? (body as { confirmation?: unknown }).confirmation
      : undefined;
    if (confirmation !== "SEED DATABASE") {
      return errJson("CONFIRMATION_PHRASE_MISMATCH", 400, "Type SEED DATABASE to confirm");
    }

    await initDb();

    const hashedPassword = await bcrypt.hash(SEED_PASSWORD, SALT_ROUNDS);
    const seededAt = new Date();
    const client = await getPool().connect();
    let activeOrderCount = 0;
    let deletedOrderCount = 0;

    try {
      await client.query("BEGIN");
      logger.info("POST /api/dev/seed - clearing tables...");
      await client.query("DELETE FROM orders");
      await client.query("DELETE FROM restaurants");
      await client.query("ALTER SEQUENCE orders_id_seq RESTART WITH 1");
      await client.query("ALTER SEQUENCE restaurants_id_seq RESTART WITH 1");

      for (const [restaurantIndex, restaurant] of SEED_RESTAURANTS.entries()) {
        if (restaurant.orderNumbers.length !== SEED_ORDER_PROFILES.length) {
          throw new Error(`Seed fixture mismatch for ${restaurant.name}`);
        }

        await client.query(
          `INSERT INTO restaurants (name, password, raw_password, complete_cap_hours)
           VALUES ($1, $2, $3, $4)`,
          [restaurant.name, hashedPassword, SEED_PASSWORD, restaurant.completeCapHours],
        );

        for (const [orderIndex, profile] of SEED_ORDER_PROFILES.entries()) {
          const ageOffset = restaurantIndex * 3;
          const receivedAt = minutesBefore(seededAt, profile.receivedMinutesAgo + ageOffset);
          const preparingAt = profile.preparingMinutesAgo === undefined
            ? null
            : minutesBefore(seededAt, profile.preparingMinutesAgo + ageOffset);
          const completeAt = profile.completeMinutesAgo === undefined
            ? null
            : minutesBefore(seededAt, profile.completeMinutesAgo + ageOffset);
          const acknowledgedAt = profile.acknowledgedMinutesAgo === undefined
            ? null
            : minutesBefore(seededAt, profile.acknowledgedMinutesAgo + ageOffset);
          const deletedAt = profile.deletedMinutesAgo === undefined
            ? null
            : minutesBefore(seededAt, profile.deletedMinutesAgo + ageOffset);
          const updatedAt = deletedAt ?? acknowledgedAt ?? completeAt ?? preparingAt ?? receivedAt;

          await client.query(
            `INSERT INTO orders (
               order_number, restaurant_name, status, created_at, updated_at,
               deleted_at, received_at, preparing_at, complete_at, acknowledged_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              restaurant.orderNumbers[orderIndex],
              restaurant.name,
              profile.status,
              receivedAt,
              updatedAt,
              deletedAt,
              receivedAt,
              preparingAt,
              completeAt,
              acknowledgedAt,
            ],
          );

          if (deletedAt) deletedOrderCount += 1;
          else activeOrderCount += 1;
        }
      }

      await client.query("COMMIT");
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackErr) {
        logger.error("POST /api/dev/seed - rollback failed", rollbackErr);
      }
      throw err;
    } finally {
      client.release();
    }

    logger.info(
      `POST /api/dev/seed - created ${SEED_RESTAURANTS.length} restaurants, ${activeOrderCount} live orders, and ${deletedOrderCount} deleted orders`,
    );
    return NextResponse.json({
      message: `Seeded ${SEED_RESTAURANTS.length} kitchens and ${activeOrderCount + deletedOrderCount} sample orders`,
      restaurants: SEED_RESTAURANTS.length,
      activeOrders: activeOrderCount,
      deletedOrders: deletedOrderCount,
    });
  } catch (err) {
    logger.error("POST /api/dev/seed - error processing request", err);
    return errJson("INTERNAL_ERROR", 500);
  }
}
