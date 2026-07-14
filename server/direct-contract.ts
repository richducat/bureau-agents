export function directContractUsesPublishedPrice(totalCents: number, publishedPriceCents: unknown) {
  const published = Number(publishedPriceCents)
  return Number.isSafeInteger(totalCents)
    && Number.isSafeInteger(published)
    && published >= 500
    && totalCents === published
}
