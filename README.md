# Archi SMS Order

Shopify app that sends transactional SMS for orders — confirmation, cash on delivery, shipping, delivery, cancellations, and refunds.

Merchants can talk to an **AI assistant** (“set up the app”, “enable SMS”, “send a test”) instead of hunting through settings. They connect Twilio, MSG91, or a custom HTTP gateway and keep their own SMS rates.

## Features

- AI assistant that can read setup, save provider credentials, enable sending, edit templates, and send a test
- Order confirmed, COD, shipped, out for delivery, delivered, cancelled, refunded
- Templates, quiet hours, logs, opt-outs, encrypted keys
- Test page with health checks so you can prove it works
- Free / Starter ($9) / Growth ($29) / Pro ($79) Shopify billing

## How merchants use it

1. Install the app in Shopify.
2. Open **AI assistant** and say what they want (or finish Settings manually).
3. Open **Test** → health checks should pass → send a test SMS to their phone.
4. Place a real order with a phone number and confirm a row in **Logs**.

## How to test that it is working

**Automated (this repo)**

```bash
npm test
```

Covers phone formatting, COD detection, templates, and secret encryption.

**In the Shopify admin (the real proof)**

1. `shopify app dev` (or your hosted app) and open **Test**.
2. All core checks should pass (provider, SMS on, templates).
3. Send a test SMS to your phone.
   - `sent` — Twilio/MSG91 accepted it. Check the handset.
   - `simulated` — app logic ran, but no live provider is connected yet.
4. Create an order with a phone number. Logs should show `order_confirmed` or `order_cod`.
5. Fulfill with tracking to test shipped / delivery texts.

## Launch (Partner Dashboard)

The GitHub repo is not enough for merchants to install. You still need a Shopify Partner app and hosting.

1. In [dev.shopify.com](https://dev.shopify.com/dashboard) create or select **Archi SMS Order**.
2. From this folder:

```bash
npm install
npx prisma generate
npx prisma migrate deploy
shopify app config link
shopify app dev
```

3. For production: host the Node app (Fly, Render, Cloud Run, etc.), set env vars (`SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`, optional `OPENAI_API_KEY`), run `npx prisma migrate deploy`, then `shopify app deploy`.
4. Install on a development store, run the Test page, then submit to the App Store when ready.

Until a provider is connected, events are logged as `simulated` so you can trial the product.

## Access scopes

`read_orders`, `write_orders`, `read_customers`, `read_fulfillments`

## Repository

https://github.com/solutionsarchilabs/Archi-SMS-Order
