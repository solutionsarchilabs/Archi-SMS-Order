export function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function normalizePhone(raw: string | null | undefined, countryCode = "IN"): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (!value) return null;

  value = value.replace(/[^\d+]/g, "");
  if (value.startsWith("00")) value = `+${value.slice(2)}`;

  if (value.startsWith("+")) {
    const e164 = `+${value.slice(1).replace(/\D/g, "")}`;
    return e164.length >= 8 ? e164 : null;
  }

  const digits = value.replace(/\D/g, "");
  if (countryCode === "IN") {
    if (digits.length === 10) return `+91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) return `+91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function toProviderNumber(e164: string, provider: string): string {
  if (provider === "msg91") return e164.replace(/^\+/, "");
  return e164;
}

export function phonesMatch(a: string, b: string, countryCode = "IN"): boolean {
  const left = normalizePhone(a, countryCode);
  const right = normalizePhone(b, countryCode);
  return Boolean(left && right && left === right);
}
