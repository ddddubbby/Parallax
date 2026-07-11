import { eq, inArray, sql } from "drizzle-orm";
import { db } from "../client";
import { resonanceStimuli } from "../schema";

export async function forceDeleteResonanceStimuliByStudy(studyId: string) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.bypass_resonance_stimulus_freeze = 'on'`);
    await tx.delete(resonanceStimuli).where(eq(resonanceStimuli.studyId, studyId));
  });
}

export async function forceDeleteResonanceStimuliByIds(ids: string[]) {
  if (ids.length === 0) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local app.bypass_resonance_stimulus_freeze = 'on'`);
    await tx.delete(resonanceStimuli).where(inArray(resonanceStimuli.id, ids));
  });
}
