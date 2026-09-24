import { text, timestamp, uuid, pgTable, uniqueIndex } from "drizzle-orm/pg-core";

// Liveness beats from long-running services. The worker upserts one row per
// process so framing batches (which have no run id) can detect an offline
// worker. Created in 0017 alongside the retired GEO-agent tables (D-141).
export const serviceHeartbeats = pgTable(
  "service_heartbeats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    service: text("service").notNull(),
    instanceId: text("instance_id").notNull(),
    state: text("state").notNull().default("online"),
    lastBeatAt: timestamp("last_beat_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("service_heartbeats_service_instance_uq").on(t.service, t.instanceId)],
);
