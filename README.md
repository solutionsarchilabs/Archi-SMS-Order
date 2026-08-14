# Archi SMS Order

Shopify app that sends transactional SMS for orders — confirmation, cash on delivery, shipping, delivery, cancellations, and refunds.

Built so merchants get fewer WISMO tickets and higher COD completion, without buying SMS credits from us. They connect Twilio, MSG91, or a custom HTTP gateway.

## Why it grows

- **Clear job to be done:** order updates, not marketing blasts
- **India-ready:** COD templates, DLT sender ID, MSG91, default `+91` numbers
- **App Store ready:** GDPR webhooks, encrypted provider keys, billing plans, opt-outs
- **Bring your own SMS:** we automate Shopify events; they keep their SMS rates

## Features

- Order confirmed, COD, shipped, out for delivery, delivered, cancelled, refunded
- Customizable templates with `{{order_name}}`, `{{customer_first_name}}`, tracking vars, and more
- Twilio, MSG91, and generic HTTP providers
- Quiet hours, monthly plan limits, opt-out list, retry failed sends
- Dashboard with setup checklist, coverage on recent orders, and SMS log
- Free / Starter ($9) / Growth ($29) / Pro ($79) Shopify billing

## Local development

Prerequisites: Node.js 20.19+ or 22.12+, [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started).

```bash
npm install
npx prisma generate
npx prisma migrate deploy
shopify app config link
shopify app dev
```

Then: Settings → connect a provider → enable SMS → send a test.

Until a provider is connected, events are logged as `simulated` so you can trial the product.

## Access scopes

`read_orders`, `write_orders`, `read_customers`, `read_fulfillments`

## Repository

https://github.com/solutionsarchilabs/Archi-SMS-Order
