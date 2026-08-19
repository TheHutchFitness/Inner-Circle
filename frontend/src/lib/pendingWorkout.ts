// Simple module-scoped handoff for sending an AI session into the workout logger.
type PendingSession = {
  name: string;
  split_key?: string;
  source?: string;
  exercises: { name: string; sets: { reps: number; weight_lb: number; rpe: number }[] }[];
} | null;

let pending: PendingSession = null;

export function setPendingWorkout(session: any) {
  if (!session) { pending = null; return; }
  pending = {
    name: session.name || "Custom Session",
    split_key: session.split_key || "custom",
    source: session.source || "ai",
    exercises: (session.exercises || []).map((ex: any) => ({
      name: ex.name || "Exercise",
      sets: Array.from({ length: Math.max(1, Number(ex.sets) || 1) }).map(() => ({
        reps: Number(ex.reps) || 5,
        weight_lb: Number(ex.weight_lb) || 45,
        rpe: Number(ex.rpe) || 7,
      })),
    })),
  };
}

export function takePendingWorkout(): PendingSession {
  const w = pending;
  pending = null;
  return w;
}

// Load a workout that already has explicit sets arrays (e.g. an admin-assigned
// in-person program) directly into the logger without collapsing sets to a count.
export function setPendingWorkoutExact(session: any) {
  if (!session) { pending = null; return; }
  pending = {
    name: session.name || "Assigned Workout",
    split_key: session.split_key || "custom",
    source: session.source || "coach",
    exercises: (session.exercises || []).map((ex: any) => ({
      name: ex.name || "Exercise",
      sets: (ex.sets || []).map((s: any) => ({
        reps: Number(s.reps) || 5,
        weight_lb: Number(s.weight_lb) || 0,
        rpe: Number(s.rpe) || 7,
      })),
    })),
  };
}
