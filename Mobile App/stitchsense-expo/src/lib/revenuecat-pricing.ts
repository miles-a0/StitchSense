export type RevenueCatPlan = 'monthly' | 'annual';

export type RevenueCatPlanPrice = {
  priceString: string;
  price: number | null;
  currencyCode: string | null;
};

export type RevenueCatPlanPricing = Partial<Record<RevenueCatPlan, RevenueCatPlanPrice>>;

export function revenueCatPlanPriceFromProduct(product: {
  priceString?: string | null;
  price?: number | null;
  currencyCode?: string | null;
}): RevenueCatPlanPrice | null {
  const priceString = typeof product.priceString === 'string' ? product.priceString.trim() : '';
  if (!priceString) {
    return null;
  }

  return {
    priceString,
    price: typeof product.price === 'number' && Number.isFinite(product.price) ? product.price : null,
    currencyCode: typeof product.currencyCode === 'string' && product.currencyCode.trim()
      ? product.currencyCode.trim().toUpperCase()
      : null,
  };
}

function formatCurrency(amount: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

export function annualSavingsLabel(pricing: RevenueCatPlanPricing) {
  const monthly = pricing.monthly;
  const annual = pricing.annual;
  if (!monthly?.price || !annual?.price || !monthly.currencyCode || !annual.currencyCode) {
    return null;
  }
  if (monthly.currencyCode !== annual.currencyCode) {
    return null;
  }

  const saving = monthly.price * 12 - annual.price;
  if (!Number.isFinite(saving) || saving <= 0) {
    return null;
  }

  return `Save ${formatCurrency(saving, annual.currencyCode)}`;
}
