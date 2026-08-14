import type { ActionFunctionArgs } from "react-router";
import { handleSmsWebhook } from "../lib/sms-webhook.server";

export const action = async (args: ActionFunctionArgs) => handleSmsWebhook(args, "orders/fulfilled");
