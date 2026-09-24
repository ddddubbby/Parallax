import { db } from "../client";
import { serviceHeartbeats } from "../schema";

export async function recordHeartbeat(service: string, instanceId: string, state = "online") {
  await db
    .insert(serviceHeartbeats)
    .values({ service, instanceId, state, lastBeatAt: new Date() })
    .onConflictDoUpdate({
      target: [serviceHeartbeats.service, serviceHeartbeats.instanceId],
      set: { state, lastBeatAt: new Date() },
    });
}
