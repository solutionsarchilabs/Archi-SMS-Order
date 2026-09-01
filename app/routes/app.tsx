import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useNavigation, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { ensureShopSetup } from "../lib/shop.server";
import { flushScheduled } from "../lib/sms.server";
import { PageLoading } from "../components/PageLoading";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const shopResponse = await admin.graphql(
    `#graphql
      query SmsShop {
        shop {
          name
          ianaTimezone
        }
      }`,
  );
  const shopJson = await shopResponse.json();
  await ensureShopSetup(session.shop, {
    storeName: shopJson.data?.shop?.name,
    timezone: shopJson.data?.shop?.ianaTimezone,
  });
  await flushScheduled(session.shop);

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export function HydrateFallback() {
  return <PageLoading />;
}

function AdminLoadingBar({ busy }: { busy: boolean }) {
  const shopify = useAppBridge();

  useEffect(() => {
    const loading = (shopify as { loading?: (value: boolean) => void }).loading;
    if (typeof loading !== "function") return;
    loading(busy);
    return () => loading(false);
  }, [busy, shopify]);

  return null;
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const busy = navigation.state !== "idle";

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AdminLoadingBar busy={busy} />
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/assistant">AI assistant</s-link>
        <s-link href="/app/test">Test</s-link>
        <s-link href="/app/templates">Templates</s-link>
        <s-link href="/app/logs">Logs</s-link>
        <s-link href="/app/settings">Settings</s-link>
        <s-link href="/app/billing">Billing</s-link>
        <s-link href="/app/help">Help</s-link>
      </s-app-nav>
      {busy ? <PageLoading /> : <Outlet />}
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
