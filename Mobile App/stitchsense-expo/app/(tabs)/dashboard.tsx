import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import React from 'react';
import {
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { useLibrary } from '@/src/providers/library-provider';
import { useProjects } from '@/src/providers/projects-provider';
import { useSession } from '@/src/providers/session-provider';
import { useStash } from '@/src/providers/stash-provider';
import { authenticatedImageSource } from '@/src/lib/api';
import { shadows, tokens } from '@/src/theme/tokens';
import type { Project } from '@/src/lib/models';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const heroImage = require('../../assets/onboarding/functional-setup.webp');
const focusedGaugeImage = require('../../assets/onboarding/focused-gauge.png');
const focusedDictionaryImage = require('../../assets/onboarding/focused-dictionary.png');
const focusedStitchVisionImage = require('../../assets/onboarding/focused-stitch-vision.png');
const focusedCounterImage = require('../../assets/onboarding/focused-counter.png');
const quickPatternImage = require('../../assets/onboarding/quick-pattern.png');
const quickYarnImage = require('../../assets/onboarding/quick-yarn.png');
const quickStuckImage = require('../../assets/onboarding/quick-stuck.png');
const quickWipImage = require('../../assets/onboarding/quick-wip.png');

function formatLastWorked(dateString?: string | null) {
  if (!dateString) return 'Not started yet';
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return 'Not started yet';
  const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (days === 0) return 'Worked on today';
  if (days === 1) return 'Worked on yesterday';
  if (days < 7) return `Worked on ${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks === 1) return 'Worked on 1 week ago';
  if (weeks < 5) return `Worked on ${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  if (months <= 1) return 'Worked on 1 month ago';
  return `Worked on ${months} months ago`;
}

type CountStatProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  value: number;
};

function CountStat({ icon, label, onPress, value }: CountStatProps) {
  return (
    <Pressable
      accessibilityLabel={`Open ${label}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.countStat, pressed ? styles.pressed : null]}>
      <Text style={styles.countValue}>{value}</Text>
      <View style={styles.countMeta}>
        <Text style={styles.countLabel}>{label}</Text>
        <MaterialCommunityIcons color={tokens.color.accent} name={icon} size={20} />
      </View>
    </Pressable>
  );
}

type NavigationTileProps = {
  icon: IconName;
  label: string;
  value: string;
  onPress: () => void;
};

function NavigationTile({ icon, label, value, onPress }: NavigationTileProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.navigationTile, pressed ? styles.pressed : null]}>
      <MaterialCommunityIcons color={tokens.color.primary} name={icon} size={26} />
      <Text style={styles.navigationLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.navigationValue}>
        {value}
      </Text>
    </Pressable>
  );
}

type ImageRouteCardProps = {
  action: string;
  copy: string;
  image: ImageSourcePropType;
  onPress: () => void;
  title: string;
};

function ImageRouteCard({ action, copy, image, onPress, title }: ImageRouteCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.routeCard, pressed ? styles.pressed : null]}>
      <ImageBackground imageStyle={styles.routeImage} source={image} style={styles.routeImageWrap} />
      <View style={styles.routeBody}>
        <Text numberOfLines={2} style={styles.routeTitle}>
          {title}
        </Text>
        <Text numberOfLines={3} style={styles.routeCopy}>
          {copy}
        </Text>
        <Text numberOfLines={1} style={styles.routeAction}>
          {action} {'->'}
        </Text>
      </View>
    </Pressable>
  );
}

type AssistantCardProps = {
  image: ImageSourcePropType;
  label: string;
  onPress: () => void;
  subtitle: string;
};

function AssistantCard({ image, label, onPress, subtitle }: AssistantCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.assistantRowCard, pressed ? styles.pressed : null]}>
      <Image source={image} style={styles.assistantRowImage} />
      <View style={styles.assistantRowCopy}>
        <Text numberOfLines={2} style={styles.assistantLabel}>
          {label}
        </Text>
        <Text numberOfLines={2} style={styles.assistantSubtitle}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

type CurrentProjectRowProps = {
  project: Project;
  onPress: () => void;
};

function CurrentProjectRow({ project, onPress }: CurrentProjectRowProps) {
  const { accessToken } = useSession();
  const thumbnailUrl = project.coverImageUrl || project.linkedPattern?.thumbnailUrl || null;
  const progress = Math.max(0, Math.min(100, Math.round(project.progressPercent ?? 0)));

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.currentProjectRow, pressed ? styles.pressed : null]}>
      <View style={styles.currentProjectThumbWrap}>
        {thumbnailUrl ? (
          <Image
            source={authenticatedImageSource(thumbnailUrl, accessToken)}
            style={styles.currentProjectThumb}
          />
        ) : (
          <View style={[styles.currentProjectThumb, styles.currentProjectThumbFallback]}>
            <MaterialCommunityIcons color={tokens.color.accent} name="image-outline" size={22} />
          </View>
        )}
      </View>
      <View style={styles.currentProjectBody}>
        <Text numberOfLines={1} style={styles.currentProjectTitle}>
          {project.title}
        </Text>
        <Text numberOfLines={1} style={styles.currentProjectLastWorked}>
          {formatLastWorked(project.lastWorkedAt ?? project.updatedAt)}
        </Text>
        <View style={styles.currentProjectProgressTrack}>
          <View style={[styles.currentProjectProgressFill, { width: `${progress}%` }]} />
        </View>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { patterns } = useLibrary();
  const { projects } = useProjects();
  const { items: stashItems } = useStash();
  const displayName = user?.displayName ?? user?.email ?? 'maker';
  const firstName = displayName.split('@')[0].split(' ')[0] || displayName;
  const activeProjects = projects.filter((project) => project.status === 'active').slice(0, 5);

  const commandTiles: NavigationTileProps[] = [
    {
      icon: 'book-open-variant',
      label: 'Library',
      value: 'Patterns',
      onPress: () => router.push('/(tabs)/library'),
    },
    {
      icon: 'notebook-outline',
      label: 'Projects',
      value: 'Planning',
      onPress: () => router.push('/(tabs)/workspace'),
    },
    {
      icon: 'needle',
      label: 'Stash',
      value: 'Yarn',
      onPress: () => router.push('/(tabs)/stash'),
    },
    {
      icon: 'message-text-outline',
      label: 'Chat',
      value: 'Ask',
      onPress: () => router.push('/(tabs)/chat'),
    },
    {
      icon: 'tools',
      label: 'Tools',
      value: 'Utilities',
      onPress: () => router.push('/(tabs)/tools'),
    },
    {
      icon: 'account-outline',
      label: 'Account',
      value: 'Settings',
      onPress: () => router.push('/(tabs)/account'),
    },
  ];

  const focusedHelp = [
    {
      image: focusedGaugeImage,
      label: 'Gauge',
      subtitle: 'Check tension, stitch gauge, row gauge, and sizing risk before you start.',
      onPress: () => router.push('/gauge-calculator'),
    },
    {
      image: focusedDictionaryImage,
      label: 'Dictionary',
      subtitle: 'Look up stitches, terms, abbreviations, and UK/US wording.',
      onPress: () => router.push('/stitch-dictionary'),
    },
    {
      image: focusedStitchVisionImage,
      label: 'Stitch Vision',
      subtitle: 'Use a photo for help with stitches, fabric, mistakes, or next steps.',
      onPress: () => router.push('/(tabs)/camera'),
    },
    {
      image: focusedCounterImage,
      label: 'Count - Row & Stitch Counter',
      subtitle: 'Quick making counter that is not tied to a project or uploaded pattern.',
      onPress: () => router.push('/quick-counter'),
    },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.brandRow}>
        <View style={styles.brandCopy}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={styles.brand}>StitchSense</Text>
          <Text style={styles.brandKicker}>AI assistant for knitters & crocheters</Text>
        </View>
        <Pressable
          accessibilityLabel="Manage account"
          accessibilityRole="button"
          onPress={() => router.push('/(tabs)/account')}
          style={({ pressed }) => [styles.brandButton, pressed ? styles.pressed : null]}>
          <MaterialCommunityIcons color="#fffdf8" name="cog-outline" size={22} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroImagePanel}>
          <Image source={heroImage} style={styles.heroImage} />
        </View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>Welcome {firstName}</Text>
        </View>
        <Text style={styles.heroText}>
          Start with a pattern, yarn, a project, or a stuck moment. StitchSense keeps the next step clear.
        </Text>
      </View>

      <View style={styles.statsRail}>
        <CountStat
          icon="view-dashboard-outline"
          label="Patterns"
          onPress={() => router.push('/(tabs)/library')}
          value={patterns.length}
        />
        <View style={styles.statDivider} />
        <CountStat
          icon="folder-outline"
          label="Projects"
          onPress={() => router.push('/(tabs)/workspace')}
          value={projects.length}
        />
        <View style={styles.statDivider} />
        <CountStat
          icon="basket-outline"
          label="Stash"
          onPress={() => router.push('/(tabs)/stash')}
          value={stashItems.length}
        />
      </View>

      {activeProjects.length > 0 ? (
        <View style={styles.currentProjectsPanel}>
          <Text style={styles.eyebrow}>In progress</Text>
          <Text style={styles.sectionTitle}>Current Projects</Text>
          <View style={styles.currentProjectsScrollContent}>
            {activeProjects.map((project) => (
              <CurrentProjectRow
                key={project.id}
                onPress={() => router.push(`/project/${project.id}`)}
                project={project}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.navigationPanel}>
        <Text style={styles.eyebrow}>App navigation</Text>
        <Text style={styles.sectionTitle}>Choose where to work</Text>
        <View style={styles.navigationGrid}>
          {commandTiles.map((tile) => (
            <NavigationTile key={tile.label} {...tile} />
          ))}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.eyebrow}>Guided routes</Text>
        <Text style={styles.sectionTitle}>Quick Starts</Text>
      </View>

      <View style={styles.cardGrid}>
        <ImageRouteCard
          action="Open Library"
          copy="Upload, import, check size and yarn."
          image={quickPatternImage}
          onPress={() => router.push('/(tabs)/library')}
          title="I have a pattern"
        />
        <ImageRouteCard
          action="Open Stash"
          copy="Record yarn and find matches."
          image={quickYarnImage}
          onPress={() => router.push('/(tabs)/stash')}
          title="I have yarn"
        />
        <ImageRouteCard
          action="Ask"
          copy="Decode a row, term, or tricky step."
          image={quickStuckImage}
          onPress={() => router.push('/(tabs)/chat')}
          title="I'm stuck"
        />
        <ImageRouteCard
          action="Open Projects"
          copy="Track progress, notes, and photos."
          image={quickWipImage}
          onPress={() => router.push('/(tabs)/workspace')}
          title="WIP's"
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.eyebrow}>Smart assistants</Text>
        <Text style={styles.sectionTitle}>Focused help</Text>
        <Text style={styles.sectionCopy}>Fast tools for the common making moments you need right now.</Text>
      </View>

      <View style={styles.assistantStack}>
        {focusedHelp.map((assistant) => (
          <AssistantCard
            key={assistant.label}
            image={assistant.image}
            label={assistant.label}
            onPress={assistant.onPress}
            subtitle={assistant.subtitle}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Developed by{' '}
          <Text
            accessibilityRole="link"
            onPress={() => void Linking.openURL('https://zu-media.co.uk')}
            style={styles.footerLink}>
            Zu-Media
          </Text>
        </Text>
        <Text style={styles.footerText}>Copyright 2026 © Zu-Media</Text>
        <Text style={styles.footerText}>All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const displayFont = tokens.font.display;
const bodyFont = tokens.font.body;
const inkSoft = '#334640';

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xl,
    gap: tokens.spacing.xl,
  },
  brandRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: tokens.spacing.md,
    justifyContent: 'space-between',
  },
  brandCopy: {
    flex: 1,
    minWidth: 0,
  },
  brand: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 42,
    letterSpacing: 0,
    lineHeight: 48,
  },
  brandKicker: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.35,
    lineHeight: 17,
    textTransform: 'uppercase',
  },
  brandButton: {
    alignItems: 'center',
    backgroundColor: tokens.color.primary,
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    marginTop: 4,
    width: 36,
    ...shadows.card,
  },
  hero: {
    backgroundColor: 'rgba(255, 253, 250, 0.46)',
    borderColor: 'rgba(20, 63, 54, 0.10)',
    borderRadius: 28,
    borderWidth: 1,
    minHeight: 322,
    overflow: 'hidden',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.xl,
  },
  heroCopy: {
    width: '58%',
    zIndex: 2,
    paddingRight: 8,
  },
  heroTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 28,
    letterSpacing: 0,
    lineHeight: 34,
    flexShrink: 1,
    maxWidth: '100%',
  },
  heroText: {
    color: '#183b35',
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 21,
    marginTop: tokens.spacing.md,
    width: '100%',
    zIndex: 2,
    backgroundColor: 'rgba(255, 253, 250, 0.86)',
    borderRadius: tokens.radius.large,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
  },
  heroImagePanel: {
    bottom: tokens.spacing.xs,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    top: tokens.spacing.xs,
    width: '46%',
    borderBottomLeftRadius: 180,
    borderTopLeftRadius: 180,
  },
  heroImage: {
    height: '100%',
    width: '100%',
  },
  statsRail: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    borderColor: 'rgba(20, 63, 54, 0.12)',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: -30,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.md,
    ...shadows.card,
  },
  countStat: {
    alignItems: 'center',
    flex: 1,
    gap: tokens.spacing.xs,
    minHeight: 70,
    justifyContent: 'center',
  },
  countValue: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 31,
    lineHeight: 34,
  },
  countMeta: {
    alignItems: 'center',
    gap: tokens.spacing.xxs,
  },
  countLabel: {
    color: '#253d38',
    fontFamily: bodyFont,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statDivider: {
    backgroundColor: 'rgba(154, 106, 33, 0.18)',
    height: 48,
    width: 1,
  },
  currentProjectsPanel: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 22,
    borderWidth: 1,
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  currentProjectsScrollContent: {
    gap: tokens.spacing.sm,
    width: '100%',
  },
  currentProjectRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 250, 0.9)',
    borderColor: 'rgba(20, 63, 54, 0.1)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    width: '100%',
  },
  currentProjectThumbWrap: {
    flexShrink: 0,
  },
  currentProjectThumb: {
    borderRadius: 12,
    height: 56,
    width: 56,
  },
  currentProjectThumbFallback: {
    alignItems: 'center',
    backgroundColor: 'rgba(154, 106, 33, 0.12)',
    justifyContent: 'center',
  },
  currentProjectBody: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  currentProjectTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 15,
    lineHeight: 18,
  },
  currentProjectLastWorked: {
    color: inkSoft,
    fontFamily: bodyFont,
    fontSize: 11,
    lineHeight: 14,
  },
  currentProjectProgressTrack: {
    backgroundColor: 'rgba(20, 63, 54, 0.12)',
    borderRadius: 999,
    height: 5,
    overflow: 'hidden',
    width: '100%',
  },
  currentProjectProgressFill: {
    backgroundColor: tokens.color.primary,
    borderRadius: 999,
    height: '100%',
  },
  navigationPanel: {
    backgroundColor: 'rgba(255, 253, 250, 0.78)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 22,
    borderWidth: 1,
    gap: tokens.spacing.md,
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 29,
  },
  navigationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  navigationTile: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 253, 250, 0.82)',
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '47.5%',
    flexGrow: 1,
    gap: 4,
    minHeight: 94,
    padding: tokens.spacing.sm,
  },
  navigationLabel: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 17,
    lineHeight: 21,
  },
  navigationValue: {
    color: inkSoft,
    fontFamily: bodyFont,
    fontSize: 11,
    lineHeight: 15,
  },
  sectionHeader: {
    gap: tokens.spacing.xs,
  },
  sectionCopy: {
    color: inkSoft,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 20,
    maxWidth: 430,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  assistantStack: {
    gap: tokens.spacing.sm,
  },
  routeCard: {
    backgroundColor: tokens.color.surface,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexBasis: '47.5%',
    flexGrow: 1,
    overflow: 'hidden',
    ...shadows.soft,
  },
  routeImageWrap: {
    height: 88,
    justifyContent: 'flex-end',
    padding: tokens.spacing.sm,
  },
  routeImage: {
    resizeMode: 'cover',
  },
  routeBody: {
    gap: 5,
    minHeight: 122,
    padding: tokens.spacing.sm,
  },
  routeTitle: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 18,
    lineHeight: 22,
  },
  routeCopy: {
    color: inkSoft,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 11,
    lineHeight: 16,
  },
  routeAction: {
    color: tokens.color.primary,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  assistantRowCard: {
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: tokens.spacing.md,
    minHeight: 102,
    padding: tokens.spacing.sm,
    ...shadows.soft,
  },
  assistantRowImage: {
    borderRadius: 13,
    height: 78,
    width: 92,
  },
  assistantRowCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  assistantLabel: {
    color: tokens.color.primary,
    fontFamily: displayFont,
    fontSize: 21,
    lineHeight: 25,
  },
  assistantSubtitle: {
    color: inkSoft,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: 0,
    paddingTop: tokens.spacing.sm,
  },
  footerText: {
    color: 'rgba(51, 70, 64, 0.72)',
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
  footerLink: {
    color: tokens.color.primary,
    fontWeight: '900',
  },
  pressed: {
    opacity: 0.94,
    transform: [{ translateY: 1 }],
  },
});
