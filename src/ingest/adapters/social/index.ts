import type { Adapter } from "../../types";
import { htmlListAdapter } from "./html-list";
import { telegramBotAdapter, telegramChannelAdapter } from "./telegram";
import { xAccountsAdapter } from "./x";

export const socialAdapters: Adapter[] = [htmlListAdapter, telegramChannelAdapter, telegramBotAdapter, xAccountsAdapter];
