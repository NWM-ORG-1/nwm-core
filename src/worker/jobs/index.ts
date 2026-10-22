import type { Job } from "../jobs";
import { autoArticlesJob } from "./auto-articles";
import { derivedJob } from "./derived";
import { retentionJob } from "./retention";
import { sentimentIndexJob } from "./sentiment-index";
import { sentimentScoreJob } from "./sentiment-score";

export const WORKER_JOBS: Job[] = [derivedJob, sentimentScoreJob, sentimentIndexJob, autoArticlesJob, retentionJob];
