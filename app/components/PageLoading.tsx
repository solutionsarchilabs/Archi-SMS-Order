export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <s-page heading={label}>
      <s-section>
        <s-stack direction="block" gap="base" alignItems="center">
          <s-spinner accessibilityLabel={label} size="large-100"></s-spinner>
          <s-paragraph tone="neutral">{label}…</s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}
