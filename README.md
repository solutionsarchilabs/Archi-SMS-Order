# Archi SMS Order

Shopify app that sends SMS notifications when customers place orders.

This is a separate app from Wholesale / other Archi products. Scaffolded from the official [Shopify React Router app template](https://github.com/Shopify/shopify-app-template-react-router).

## Features (scaffold)

- Embedded admin home with recent orders and SMS log
- Settings to enable SMS and set a sender ID
- `orders/create` webhook that queues an SMS when notifications are on
- Prisma models for `SmsSetting` and `SmsLog`

Provider delivery (Twilio, MSG91, etc.) is not wired yet. Store API keys in `.env`, never in git.

## Local development

Prerequisites: Node.js 20.19+ or 22.12+, [Shopify CLI](https://shopify.dev/docs/apps/tools/cli/getting-started).

```bash
npm install
npx prisma generate
npx prisma migrate deploy
shopify app config link
shopify app dev
```

`shopify app dev` will create or link a Partner app, fill `shopify.app.toml`, and tunnel the embedded app.

## Access scopes

- `read_orders`
- `write_orders`
- `read_customers`

## Repository

https://github.com/solutionsarchilabs/Archi-SMS-Order
