import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Order SMS that cuts WISMO and recovers COD</h1>
        <p className={styles.text}>
          Archi SMS Order texts customers when they buy, when cash-on-delivery is due, and when the
          package ships or arrives — automatically from Shopify.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g. my-store.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Fewer support tickets.</strong> Shipping and delivery texts answer “where is my
            order?” before the customer opens chat.
          </li>
          <li>
            <strong>Better COD completion.</strong> Confirm the amount and keep customers ready for
            the courier.
          </li>
          <li>
            <strong>Your SMS provider.</strong> Connect Twilio, MSG91, or any HTTP gateway. No
            locked-in message markup.
          </li>
        </ul>
      </div>
    </div>
  );
}
