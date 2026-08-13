import { type CreateJobInput, cancelJob, createJob, getJob, resultOf } from "../models/job.model";
import type { Job } from "../models/types";
import { type JobView, presentJob } from "../views/job.view";

export const jobController = {
  create(sessionId: string, input: CreateJobInput): JobView {
    return presentJob(createJob(sessionId, input));
  },

  status(sessionId: string, id: string): JobView {
    return presentJob(getJob(id, sessionId));
  },

  /** The SSE route needs the entity itself to subscribe to its listener set. */
  entity(sessionId: string, id: string): Job {
    return getJob(id, sessionId);
  },

  result(sessionId: string, id: string): Uint8Array {
    return resultOf(id, sessionId);
  },

  cancel(sessionId: string, id: string): void {
    cancelJob(id, sessionId);
  },
};
