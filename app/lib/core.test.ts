import { describe, expect, it } from "vitest";
import { encrypt, decrypt, maskSecret } from "../lib/crypto.server";
import { isCodOrder, orderPhone } from "../lib/order.server";
import { normalizePhone, toProviderNumber } from "../lib/phone.server";
import { renderTemplate } from "../lib/templates.server";

describe("normalizePhone", () => {
  it("adds +91 for 10-digit Indian numbers", () => {
    expect(normalizePhone("9876543210")).toBe("+919876543210");
  });

  it("keeps E.164", () => {
    expect(normalizePhone("+14155552671")).toBe("+14155552671");
  });

  it("rejects empty", () => {
    expect(normalizePhone("")).toBeNull();
  });
});

describe("toProviderNumber", () => {
  it("strips plus for MSG91", () => {
    expect(toProviderNumber("+919876543210", "msg91")).toBe("919876543210");
  });
});

describe("renderTemplate", () => {
  it("fills order variables", () => {
    const text = renderTemplate("Hi {{customer_first_name}}, {{order_name}} is {{order_total}}", {
      customer_first_name: "Asha",
      order_name: "#1001",
      order_total: "₹10",
    });
    expect(text).toBe("Hi Asha, #1001 is ₹10");
  });
});

describe("isCodOrder", () => {
  it("detects COD gateways", () => {
    expect(isCodOrder({ payment_gateway_names: ["Cash on Delivery (COD)"] })).toBe(true);
    expect(isCodOrder({ gateway: "shopify_payments" })).toBe(false);
  });
});

describe("orderPhone", () => {
  it("prefers order phone then shipping", () => {
    expect(orderPhone({ shipping_address: { phone: "111" }, customer: { phone: "222" } })).toBe("111");
    expect(orderPhone({ phone: "999", shipping_address: { phone: "111" } })).toBe("999");
  });
});

describe("crypto", () => {
  it("round-trips secrets", () => {
    const encoded = encrypt("secret-token");
    expect(encoded).not.toBe("secret-token");
    expect(decrypt(encoded)).toBe("secret-token");
    expect(maskSecret("abcdefgh")).toBe("••••efgh");
  });
});
