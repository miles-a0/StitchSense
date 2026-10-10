import { MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  type GestureResponderEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { getStoredItem, setStoredItem } from '@/src/lib/secure-storage';
import { shadows, tokens } from '@/src/theme/tokens';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

type MenuItem = {
  description: string;
  href: Href;
  icon: IconName;
  label: string;
  routeName?: string;
};

type MenuSection = {
  title: string;
  items: MenuItem[];
};

type MenuHandlePosition = {
  side: 'left' | 'right';
  yRatio: number;
};

const handlePositionStorageKey = 'stitchsense-menu-handle-position-v1';
const menuHandleHeight = 54;
const defaultHandlePosition: MenuHandlePosition = {
  side: 'right',
  yRatio: 0.66,
};

const menuSections: MenuSection[] = [
  {
    title: 'Main spaces',
    items: [
      {
        description: 'Your starting point and latest making activity.',
        href: '/(tabs)/dashboard',
        icon: 'home-outline',
        label: 'Home',
        routeName: 'dashboard',
      },
      {
        description: 'Patterns, imports, uploads, and saved sources.',
        href: '/(tabs)/library',
        icon: 'library-outline',
        label: 'Library',
        routeName: 'library',
      },
      {
        description: 'Active projects, counters, notes, and timelines.',
        href: '/(tabs)/workspace',
        icon: 'folder-multiple-outline',
        label: 'Projects',
        routeName: 'workspace',
      },
      {
        description: 'General StitchSense help and making questions.',
        href: '/(tabs)/chat',
        icon: 'message-text-outline',
        label: 'Chat',
        routeName: 'chat',
      },
      {
        description: 'Yarn, hooks, needles, and supplies.',
        href: '/(tabs)/stash',
        icon: 'basket-outline',
        label: 'Stash',
        routeName: 'stash',
      },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        description: 'Use a photo for stitch, fabric, or mistake help.',
        href: '/(tabs)/camera',
        icon: 'camera-outline',
        label: 'Photo help',
        routeName: 'camera',
      },
      {
        description: 'Gauge math with practical adjustment advice.',
        href: '/gauge-calculator',
        icon: 'ruler-square-compass',
        label: 'Gauge calculator',
      },
      {
        description: 'Rows and stitches without losing your place.',
        href: '/quick-counter',
        icon: 'counter',
        label: 'Quick counter',
      },
      {
        description: 'Look up stitch meanings and techniques.',
        href: '/stitch-dictionary',
        icon: 'book-open-variant',
        label: 'Stitch dictionary',
      },
      {
        description: 'Browse focused assistants for specific questions.',
        href: '/(tabs)/tools',
        icon: 'hammer-wrench',
        label: 'Smart assistants',
        routeName: 'tools',
      },
    ],
  },
  {
    title: 'Account and imports',
    items: [
      {
        description: 'Import Ravelry metadata and owned sources.',
        href: '/ravelry',
        icon: 'download-outline',
        label: 'Ravelry import',
      },
      {
        description: 'Add a pattern file to your private library.',
        href: '/pattern-upload',
        icon: 'file-upload-outline',
        label: 'Upload pattern',
      },
      {
        description: 'Subscription, privacy, sync, and app settings.',
        href: '/(tabs)/account',
        icon: 'account-circle-outline',
        label: 'Account',
        routeName: 'account',
      },
    ],
  },
];

function routeNameFromPathname(pathname: string) {
  if (pathname === '/' || pathname.includes('/dashboard')) return 'dashboard';
  if (pathname.includes('/library') || pathname.startsWith('/pattern/')) return 'library';
  if (pathname.includes('/workspace') || pathname.startsWith('/project/')) return 'workspace';
  if (pathname.includes('/chat') || pathname.includes('/helper-chat')) return 'chat';
  if (pathname.includes('/stash')) return 'stash';
  if (pathname.includes('/camera')) return 'camera';
  if (
    pathname.includes('/tools')
    || pathname.includes('/gauge-calculator')
    || pathname.includes('/quick-counter')
    || pathname.includes('/stitch-dictionary')
  ) {
    return 'tools';
  }
  if (
    pathname.includes('/account')
    || pathname.includes('/ravelry')
    || pathname.includes('/pattern-upload')
    || pathname.includes('/paywall')
  ) {
    return 'account';
  }
  return undefined;
}

function shouldHideMenu(pathname: string) {
  return pathname.includes('/sign-in')
    || pathname.includes('/forgot-password')
    || pathname.includes('/onboarding');
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function readHandlePosition(value: string | null): MenuHandlePosition {
  if (!value) return defaultHandlePosition;

  try {
    const parsed = JSON.parse(value) as Partial<MenuHandlePosition>;
    const side = parsed.side === 'left' ? 'left' : 'right';
    const yRatio = typeof parsed.yRatio === 'number' && Number.isFinite(parsed.yRatio)
      ? clamp(parsed.yRatio, 0.22, 0.82)
      : defaultHandlePosition.yRatio;
    return { side, yRatio };
  } catch {
    return defaultHandlePosition;
  }
}

function MenuItemButton({
  active,
  item,
  onPress,
}: {
  active: boolean;
  item: MenuItem;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={active ? { selected: true } : undefined}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        active ? styles.menuItemActive : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={[styles.menuItemIcon, active ? styles.menuItemIconActive : null]}>
        <MaterialCommunityIcons
          color={active ? tokens.color.surface : tokens.color.primary}
          name={item.icon}
          size={21}
        />
      </View>
      <View style={styles.menuItemBody}>
        <Text numberOfLines={1} style={styles.menuItemLabel}>
          {item.label}
        </Text>
        <Text numberOfLines={2} style={styles.menuItemDescription}>
          {item.description}
        </Text>
      </View>
      <MaterialCommunityIcons
        color={active ? tokens.color.primary : 'rgba(20, 63, 54, 0.42)'}
        name="chevron-right"
        size={22}
      />
    </Pressable>
  );
}

export function AppTabBar() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { height, width } = useWindowDimensions();
  const [menuVisible, setMenuVisible] = useState(false);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  const [handlePosition, setHandlePosition] = useState<MenuHandlePosition>(defaultHandlePosition);
  const [sheetProgress] = useState(() => new Animated.Value(0));
  const [dragPulse] = useState(() => new Animated.Value(0));
  const suppressNextPressRef = useRef(false);
  const activeRouteName = routeNameFromPathname(pathname);

  const handleMinimumTop = Math.max(insets.top + 92, 112);
  const handleMaximumTop = Math.max(handleMinimumTop, height - Math.max(insets.bottom + 132, 150));
  const handleTop = clamp(
    Math.round(height * handlePosition.yRatio - menuHandleHeight / 2),
    handleMinimumTop,
    handleMaximumTop,
  );

  useEffect(() => {
    let mounted = true;

    void getStoredItem(handlePositionStorageKey)
      .then((value) => {
        if (mounted) {
          setHandlePosition(readHandlePosition(value));
        }
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!menuVisible) return;

    if (reduceMotion) {
      sheetProgress.setValue(1);
      return;
    }

    sheetProgress.setValue(0);
    const animation = Animated.timing(sheetProgress, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
      toValue: 1,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [menuVisible, reduceMotion, sheetProgress]);

  useEffect(() => {
    if (!isDraggingHandle || reduceMotion) {
      dragPulse.stopAnimation();
      dragPulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(dragPulse, {
          duration: 720,
          easing: Easing.inOut(Easing.cubic),
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(dragPulse, {
          duration: 720,
          easing: Easing.inOut(Easing.cubic),
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [dragPulse, isDraggingHandle, reduceMotion]);

  const closeMenu = (afterClose?: () => void) => {
    if (reduceMotion) {
      setMenuVisible(false);
      afterClose?.();
      return;
    }

    const animation = Animated.timing(sheetProgress, {
      duration: 190,
      easing: Easing.in(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (!finished) return;
      setMenuVisible(false);
      afterClose?.();
    });
  };

  const openRoute = (item: MenuItem) => {
    closeMenu(() => {
      router.push(item.href);
    });
  };

  const updateHandlePosition = (event: GestureResponderEvent) => {
    const nextSide: MenuHandlePosition['side'] = event.nativeEvent.pageX < width / 2 ? 'left' : 'right';
    const nextTop = clamp(
      event.nativeEvent.pageY - menuHandleHeight / 2,
      handleMinimumTop,
      handleMaximumTop,
    );
    setHandlePosition({
      side: nextSide,
      yRatio: clamp((nextTop + menuHandleHeight / 2) / height, 0.22, 0.82),
    });
  };

  const saveHandlePosition = (nextPosition: MenuHandlePosition) => {
    void setStoredItem(handlePositionStorageKey, JSON.stringify(nextPosition)).catch(() => undefined);
  };

  const finishHandleDrag = (event: GestureResponderEvent) => {
    const nextSide: MenuHandlePosition['side'] = event.nativeEvent.pageX < width / 2 ? 'left' : 'right';
    const nextTop = clamp(
      event.nativeEvent.pageY - menuHandleHeight / 2,
      handleMinimumTop,
      handleMaximumTop,
    );
    const nextPosition: MenuHandlePosition = {
      side: nextSide,
      yRatio: clamp((nextTop + menuHandleHeight / 2) / height, 0.22, 0.82),
    };
    setHandlePosition(nextPosition);
    saveHandlePosition(nextPosition);
    setIsDraggingHandle(false);
  };

  const sheetTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [height, 0],
  });
  const backdropOpacity = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const dragScale = dragPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.045],
  });

  if (shouldHideMenu(pathname)) {
    return null;
  }

  const handleSideStyle = handlePosition.side === 'left'
    ? styles.menuHandleWrapLeft
    : styles.menuHandleWrapRight;
  const handleShapeStyle = handlePosition.side === 'left'
    ? styles.menuHandleLeft
    : styles.menuHandleRight;
  const stitchStyle = handlePosition.side === 'left'
    ? styles.handleStitchesLeft
    : styles.handleStitchesRight;

  return (
    <>
      <View
        style={[
          styles.menuHandleWrap,
          handleSideStyle,
          {
            top: handleTop,
          },
        ]}>
        <Animated.View
          style={[
            styles.menuHandleAnimated,
            {
              transform: [{ scale: isDraggingHandle ? dragScale : 1 }],
            },
          ]}>
          <Pressable
            accessibilityHint="Long press and drag to move this menu tab."
            accessibilityLabel="Open app menu"
            accessibilityRole="button"
            accessibilityState={menuVisible ? { expanded: true } : undefined}
            delayLongPress={360}
            onLongPress={(event) => {
              suppressNextPressRef.current = true;
              setIsDraggingHandle(true);
              updateHandlePosition(event);
            }}
            onPress={() => {
              if (suppressNextPressRef.current) {
                suppressNextPressRef.current = false;
                return;
              }
              setMenuVisible(true);
            }}
            onPressOut={(event) => {
              if (isDraggingHandle) {
                finishHandleDrag(event);
              }
            }}
            onTouchMove={(event) => {
              if (isDraggingHandle) {
                updateHandlePosition(event);
              }
            }}
            style={({ pressed }) => [
              styles.menuHandle,
              handleShapeStyle,
              isDraggingHandle ? styles.menuHandleDragging : null,
              pressed ? styles.pressed : null,
            ]}>
            <View style={[styles.handleStitches, stitchStyle]}>
              <View style={styles.handleStitch} />
              <View style={styles.handleStitch} />
              <View style={styles.handleStitch} />
            </View>
            <MaterialCommunityIcons color={tokens.color.primary} name="dots-grid" size={23} />
          </Pressable>
        </Animated.View>
      </View>

      <Modal
        animationType="none"
        onRequestClose={() => closeMenu()}
        transparent
        visible={menuVisible}>
        <View style={styles.modalRoot}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable
              accessibilityLabel="Close app menu"
              accessibilityRole="button"
              onPress={() => closeMenu()}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.sheet,
              {
                maxHeight: Math.min(height * 0.86, 720),
                paddingBottom: Math.max(insets.bottom, tokens.spacing.lg),
                transform: [{ translateY: sheetTranslateY }],
              },
            ]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetEyebrow}>StitchSense</Text>
                <Text style={styles.sheetTitle}>Where would you like to go?</Text>
              </View>
              <Pressable
                accessibilityLabel="Close app menu"
                accessibilityRole="button"
                onPress={() => closeMenu()}
                style={({ pressed }) => [styles.closeButton, pressed ? styles.pressed : null]}>
                <MaterialCommunityIcons color={tokens.color.primary} name="close" size={22} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.menuContent}
              showsVerticalScrollIndicator={false}>
              {menuSections.map((section) => (
                <View key={section.title} style={styles.menuSection}>
                  <Text style={styles.menuSectionTitle}>{section.title}</Text>
                  <View style={styles.menuSectionList}>
                    {section.items.map((item) => (
                      <MenuItemButton
                        key={`${section.title}-${item.label}`}
                        active={item.routeName === activeRouteName}
                        item={item}
                        onPress={() => openRoute(item)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

const bodyFont = tokens.font.body;
const displayFont = tokens.font.display;

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(18, 56, 50, 0.34)',
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  handleStitch: {
    backgroundColor: 'rgba(154, 106, 33, 0.58)',
    borderRadius: 999,
    height: 4,
    width: 4,
  },
  handleStitches: {
    gap: 4,
    position: 'absolute',
  },
  handleStitchesLeft: {
    right: 7,
  },
  handleStitchesRight: {
    left: 7,
  },
  menuHandle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderColor: tokens.color.border,
    borderWidth: 1,
    height: 54,
    justifyContent: 'center',
    width: 58,
    ...shadows.raised,
  },
  menuHandleAnimated: {
    height: 54,
    width: 58,
  },
  menuHandleDragging: {
    backgroundColor: 'rgba(220, 244, 225, 0.98)',
    borderColor: 'rgba(47, 125, 90, 0.36)',
  },
  menuHandleLeft: {
    borderBottomRightRadius: 18,
    borderLeftWidth: 0,
    borderTopRightRadius: 18,
    paddingRight: 10,
  },
  menuHandleRight: {
    borderBottomLeftRadius: 18,
    borderRightWidth: 0,
    borderTopLeftRadius: 18,
    paddingLeft: 10,
  },
  menuHandleWrap: {
    backgroundColor: 'transparent',
    position: 'absolute',
  },
  menuHandleWrapLeft: {
    alignItems: 'flex-start',
    left: 0,
  },
  menuHandleWrapRight: {
    alignItems: 'flex-end',
    right: 0,
  },
  closeButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  menuContent: {
    gap: tokens.spacing.xl,
    paddingBottom: tokens.spacing.xl,
  },
  menuItem: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.md,
    minHeight: 76,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  menuItemActive: {
    backgroundColor: '#f4eadc',
    borderColor: 'rgba(47, 125, 90, 0.34)',
  },
  menuItemBody: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  menuItemDescription: {
    color: tokens.color.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 17,
  },
  menuItemIcon: {
    alignItems: 'center',
    backgroundColor: tokens.color.surfaceWarm,
    borderColor: tokens.color.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  menuItemIconActive: {
    backgroundColor: tokens.color.primary,
  },
  menuItemLabel: {
    color: tokens.color.text,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 19,
  },
  menuSection: {
    gap: tokens.spacing.sm,
  },
  menuSectionList: {
    gap: tokens.spacing.sm,
  },
  menuSectionTitle: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    lineHeight: 16,
    paddingHorizontal: tokens.spacing.xs,
    textTransform: 'uppercase',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.98 }],
  },
  sheet: {
    backgroundColor: tokens.color.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.sm,
    ...shadows.raised,
  },
  sheetEyebrow: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: 'rgba(20, 63, 54, 0.2)',
    borderRadius: 999,
    height: 5,
    marginBottom: tokens.spacing.lg,
    width: 46,
  },
  sheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.lg,
  },
  sheetTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 33,
  },
  sheetTitleBlock: {
    flex: 1,
    gap: tokens.spacing.xs,
    minWidth: 0,
  },
});
