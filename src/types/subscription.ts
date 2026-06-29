/**
 * subscription.ts
 *
 * All TypeScript types for the subscription / monetization layer.
 *
 * CURRENT STATE: Every user gets FREE plan with full access.
 * No payment logic is active yet.
 *
 * FUTURE: Swap plan values, toggle feature flags, wire in a payment
 * gateway (Stripe, etc.) — no structural changes needed here.
 */

// ─── Plans ────────────────────────────────────────────────────────────────────

export type Plan =
  | 'free'
  | 'premium'
  | 'pro'
  | 'enterprise';

export type BillingCycle =
  | 'monthly'
  | 'annual'
  | 'lifetime';

// ─── Subscription status ──────────────────────────────────────────────────────

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'cancelled'
  | 'expired'
  | 'inactive';

export type AccountStatus =
  | 'active'
  | 'suspended'
  | 'deleted';

// ─── Feature entitlements ─────────────────────────────────────────────────────

export interface FeatureEntitlements {
  surveyPoints:        boolean;
  pointSets:           boolean;
  slopeCalculator:     boolean;
  elevationCalculator: boolean;
  unitConverter:       boolean;
  cloudSync:           boolean;
  unlimitedPoints:     boolean;
  multiProject:        boolean;
  dataExport:          boolean;
  advancedReports:     boolean;
  teamCollaboration:   boolean;
  apiAccess:           boolean;
  prioritySupport:     boolean;
  maxPoints:           number | null;
  maxSets:             number | null;
  maxProjects:         number | null;
}

// ─── User profile stored in Firestore /userProfiles/{userId} ─────────────────

export interface UserProfile {
  userId:       string;
  email:        string;
  displayName?: string;
  createdAt:    number;
  updatedAt:    number;
  lastLoginAt:  number;
  accountStatus: AccountStatus;
  plan:               Plan;
  subscriptionStatus: SubscriptionStatus;
  billingCycle?:      BillingCycle | null;
  subscriptionId?:    string | null;
  customerId?:        string | null;
  planStartDate?:   number | null;
  planExpiresAt?:   number | null;
  trialStartDate?:  number | null;
  trialEndsAt?:     number | null;
  isPremium:        boolean;
  isTrialing:       boolean;
  hasLifetimeAccess: boolean;
  promoCode?:       string | null;
  promoExpiresAt?:  number | null;
  features: FeatureEntitlements;
  isAdmin:         boolean;
  manualOverride?: boolean;
  adminNotes?:     string;
}

// ─── Future Firestore collections (types only) ────────────────────────────────

export interface SubscriptionRecord {
  subscriptionId:  string;
  userId:          string;
  plan:            Plan;
  billingCycle:    BillingCycle;
  status:          SubscriptionStatus;
  startDate:       number;
  endDate?:        number | null;
  cancelledAt?:    number | null;
  gateway:         'stripe' | 'google_play' | 'apple' | 'razorpay' | 'paypal' | 'manual';
  gatewaySubId?:   string;
  createdAt:       number;
  updatedAt:       number;
}

export interface PaymentRecord {
  paymentId:         string;
  userId:            string;
  subscriptionId?:   string;
  amount:            number;
  currency:          string;
  status:            'succeeded' | 'pending' | 'failed' | 'refunded';
  gateway:           string;
  gatewayPaymentId?: string;
  description?:      string;
  createdAt:         number;
}

export interface InvoiceRecord {
  invoiceId:   string;
  userId:      string;
  paymentId?:  string;
  lineItems:   Array<{ description: string; amount: number }>;
  totalAmount: number;
  currency:    string;
  pdfUrl?:     string;
  createdAt:   number;
}

export interface PromoCode {
  code:           string;
  description:    string;
  discountPct?:   number;
  discountFlat?:  number;
  grantsFreePlan: Plan | null;
  validFrom:      number;
  validUntil?:    number | null;
  maxUses?:       number | null;
  usedCount:      number;
  isActive:       boolean;
  createdAt:      number;
}

export interface FeatureFlag {
  flagId:      string;
  description: string;
  enabled:     boolean;
  appliesTo:   Plan[] | 'all';
  updatedAt:   number;
}

// ─── Plan feature sets ────────────────────────────────────────────────────────

export const FREE_PLAN_FEATURES: FeatureEntitlements = {
  surveyPoints:        true,
  pointSets:           true,
  slopeCalculator:     true,
  elevationCalculator: true,
  unitConverter:       true,
  cloudSync:           true,
  unlimitedPoints:     true,
  multiProject:        false,
  dataExport:          false,
  advancedReports:     false,
  teamCollaboration:   false,
  apiAccess:           false,
  prioritySupport:     false,
  maxPoints:           null,
  maxSets:             null,
  maxProjects:         null,
};

export const FULL_ACCESS_FEATURES: FeatureEntitlements = {
  surveyPoints:        true,
  pointSets:           true,
  slopeCalculator:     true,
  elevationCalculator: true,
  unitConverter:       true,
  cloudSync:           true,
  unlimitedPoints:     true,
  multiProject:        true,
  dataExport:          true,
  advancedReports:     true,
  teamCollaboration:   true,
  apiAccess:           true,
  prioritySupport:     true,
  maxPoints:           null,
  maxSets:             null,
  maxProjects:         null,
};
