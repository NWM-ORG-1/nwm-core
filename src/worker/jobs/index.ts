import type { Job } from "../jobs";
import { derivedJob } from "./derived";
import { retentionJob } from "./retention";

export const WORKER_JOBS: Job[] = [derivedJob, retentionJob];
