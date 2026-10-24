import type { Adapter } from "../../types";
import { jsonListAdapter } from "./json-list";
import { pageWatchAdapter } from "./page-watch";

export const genericAdapters: Adapter[] = [pageWatchAdapter, jsonListAdapter];
