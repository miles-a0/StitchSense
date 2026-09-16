import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { stitchSenseAPI } from '@/src/lib/api';
import type { Promotion } from '@/src/lib/models';
import { purchaseRevenueCatPlan, usesRevenueCatStoreBilling } from '@/src/lib/revenuecat';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';
import { getStoredItem, setStoredItem } from '@/src/lib/secure-storage';

const usesStoreBilling = usesRevenueCatStoreBilling();

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function audienceMatches(promo: Promotion, accessSource?: string | null, status?: string | null) {
  const audience = promo.audience ?? 'all';
  if (audience === 'all') return true;
  if (audience === 'trial') return accessSource === 'standard_trial' || accessSource === 'manual_trial';
  if (audience === 'free') return accessSource === 'none' || status === 'expired';
  if (audience === 'pro') return accessSource !== 'none' && status !== 'expired';
  return true;
}

function dismissStorageKey(userId: string, promo: Promotion) {
  const raw = `${promo.id}-${promo.dismissKey || promo.id}`.replace(/[^A-Za-z0-9._-]/g, '-');
  return `stitchsense-promo-${userId}-${raw}`.slice(0, 180);
}

export function PromoPopup() {
  const router = useRouter();
  const { accessToken, entitlement, refreshAccount, user } = useSession();
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [activePromo, setActivePromo] = useState<Promotion | null>(null);
  const [isActing, setIsActing] = useState(false);

  const eligiblePromos = useMemo(
    () =>
      promotions.filter((promo) =>
        audienceMatches(promo, entitlement?.accessSource, entitlement?.status),
      ),
    [entitlement?.accessSource, entitlement?.status, promotions],
  );

  useEffect(() => {
    let cancelled = false;
    async function loadPromos() {
      if (!accessToken || !user?.id) return;
      try {
        const response = await stitchSenseAPI.promotions(accessToken);
        if (!cancelled) {
          setPromotions(response.promotions ?? []);
        }
      } catch {
        if (!cancelled) {
          setPromotions([]);
        }
      }
    }
    void loadPromos();
    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function pickPromo() {
      if (!user?.id || activePromo || eligiblePromos.length === 0) return;
      for (const promo of eligiblePromos) {
        const dismissed = await getStoredItem(dismissStorageKey(user.id, promo));
        if (!dismissed && !cancelled) {
          setActivePromo(promo);
          return;
        }
      }
    }
    void pickPromo();
    return () => {
      cancelled = true;
    };
  }, [activePromo, eligiblePromos, user?.id]);

  async function dismissPromo() {
    if (user?.id && activePromo) {
      await setStoredItem(dismissStorageKey(user.id, activePromo), new Date().toISOString());
    }
    setActivePromo(null);
  }

  async function runPromoAction() {
    if (!activePromo || !accessToken) return;
    setIsActing(true);
    try {
      const action = activePromo.action;
      await dismissPromo();
      if (action.type === 'url' && action.url) {
        try {
          await WebBrowser.openBrowserAsync(action.url);
        } catch {
          await Linking.openURL(action.url);
        }
        return;
      }
      if (action.type === 'checkout') {
        if (!usesStoreBilling) {
          throw new Error('Mobile subscriptions require an iOS or Android store build.');
        }
        if (!user?.id) {
          throw new Error('Sign in before starting a subscription.');
        }
        const purchase = await purchaseRevenueCatPlan(user.id, action.checkoutPlan === 'monthly' ? 'monthly' : 'annual');
        if (purchase.status === 'cancelled') {
          return;
        }
        await wait(1500);
        await refreshAccount();
        return;
      }
      if (action.type === 'app_route' && action.appRoute) {
        router.push(action.appRoute as Href);
        return;
      }
      router.push({
        pathname: '/paywall',
        params: {
          plan: action.checkoutPlan === 'monthly' ? 'monthly' : 'annual',
          promoCode: action.promoCode ?? '',
          couponId: action.couponId ?? '',
          promotionCodeId: action.promotionCodeId ?? '',
        },
      });
    } finally {
      setIsActing(false);
    }
  }

  if (!activePromo) {
    return null;
  }

  return (
    <Modal animationType="fade" onRequestClose={() => void dismissPromo()} transparent visible>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" onPress={() => void dismissPromo()} style={styles.closeButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
          <Image contentFit="cover" source={{ uri: activePromo.imageUrl }} style={styles.image} />
          {activePromo.title ? <Text style={styles.title}>{activePromo.title}</Text> : null}
          {activePromo.body ? <Text style={styles.body}>{activePromo.body}</Text> : null}
          <View style={styles.actions}>
            <BrandButton
              label={isActing ? 'Opening...' : activePromo.buttonLabel || 'View offer'}
              loading={isActing}
              onPress={() => void runPromoAction()}
              style={styles.fullWidth}
            />
            <BrandButton
              label="Not now"
              onPress={() => void dismissPromo()}
              style={styles.fullWidth}
              variant="ghost"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43,31,26,0.46)',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  card: {
    borderRadius: tokens.radius.sheet,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  closeButton: {
    alignSelf: 'flex-end',
    minHeight: 36,
    justifyContent: 'center',
  },
  closeText: {
    color: tokens.color.muted,
    fontSize: 13,
    fontWeight: '900',
  },
  image: {
    width: '100%',
    aspectRatio: 0.78,
    borderRadius: tokens.radius.xlarge,
    backgroundColor: tokens.color.surfaceWarm,
  },
  title: {
    color: tokens.color.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  body: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    gap: tokens.spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
});
