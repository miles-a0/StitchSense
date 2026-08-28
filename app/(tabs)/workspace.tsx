import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ProjectCard } from '@/src/components/projects/project-card';
import { BrandButton } from '@/src/components/ui/brand-button';
import { EmptyState } from '@/src/components/ui/empty-state';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { SwipeToDelete } from '@/src/components/ui/swipe-to-delete';
import { stitchSenseAPI } from '@/src/lib/api';
import { useSession } from '@/src/providers/session-provider';
import {
  isProjectDueSoon,
  nextProjectAction,
  projectIdleDays,
  projectRecency,
} from '@/src/lib/making-insights';
import type { Project } from '@/src/lib/models';
import { useProjects } from '@/src/providers/projects-provider';
import { shadows, tokens } from '@/src/theme/tokens';

function ProjectCardSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonThumb} />
      <View style={styles.skeletonBody}>
        <View style={styles.skeletonLineLg} />
        <View style={styles.skeletonLineMd} />
        <View style={styles.skeletonLineSm} />
      </View>
    </View>
  );
}

const projectFilters = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'ready', label: 'Ready' },
  { id: 'setup', label: 'Needs setup' },
  { id: 'planned', label: 'Planned' },
  { id: 'paused', label: 'Paused' },
  { id: 'quiet', label: 'Quiet' },
  { id: 'completed', label: 'Done' },
  { id: 'due', label: 'Due soon' },
] as const;

type ProjectFilter = (typeof projectFilters)[number]['id'];
type ProjectStatIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

function projectNeedsSetup(project: Project) {
  return (
    project.status !== 'completed' &&
    project.status !== 'archived' &&
    (!project.yarnDetails ||
      !project.needleHookDetails ||
      !project.topCounter ||
      project.progressPercent <= 0)
  );
}

function projectReadyToMake(project: Project) {
  return (
    project.status === 'active' &&
    Boolean(project.yarnDetails || project.topCounter) &&
    project.progressPercent < 100
  );
}

function projectIsQuiet(project: Project) {
  if (project.status === 'paused') return true;
  if (project.status !== 'active') return false;
  const days = projectIdleDays(project);
  return days !== null && days >= 7;
}

type ProjectStatProps = {
  icon: ProjectStatIcon;
  label: string;
  onPress: () => void;
  value: number;
};

function ProjectStat({ icon, label, onPress, value }: ProjectStatProps) {
  return (
    <Pressable
      accessibilityLabel={`Show ${label} projects`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.projectStat, pressed ? styles.pressed : null]}>
      <Text style={styles.projectStatValue}>{value}</Text>
      <View style={styles.projectStatMeta}>
        <Text numberOfLines={2} style={styles.projectStatLabel}>
          {label}
        </Text>
        <MaterialCommunityIcons color={tokens.color.accent} name={icon} size={18} />
      </View>
    </Pressable>
  );
}

export default function WorkspaceScreen() {
  const router = useRouter();
  const { filter: filterParam } = useLocalSearchParams<{ filter?: string }>();
  const { accessToken } = useSession();
  const { projects, isLoading, errorMessage, refreshProjects, removeProject } = useProjects();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProjectFilter>('all');
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void refreshProjects();
    }, [refreshProjects]),
  );

  useEffect(() => {
    const requestedFilter = projectFilters.find((entry) => entry.id === filterParam)?.id;
    if (requestedFilter) {
      setFilter(requestedFilter);
    }
  }, [filterParam]);

  const filteredProjects = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    let nextProjects = projects;

    if (filter === 'due') {
      nextProjects = nextProjects.filter(isProjectDueSoon);
    } else if (filter === 'setup') {
      nextProjects = nextProjects.filter(projectNeedsSetup);
    } else if (filter === 'ready') {
      nextProjects = nextProjects.filter(projectReadyToMake);
    } else if (filter === 'quiet') {
      nextProjects = nextProjects.filter(projectIsQuiet);
    } else if (filter !== 'all') {
      nextProjects = nextProjects.filter((project) => project.status === filter);
    }

    if (trimmed) {
      nextProjects = nextProjects.filter((project) =>
        [
          project.title,
          project.linkedPattern?.title,
          project.stageLabel,
          project.recipient,
          project.occasion,
          project.notes,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(trimmed)),
      );
    }

    return [...nextProjects].sort((left, right) => {
      if (left.isFavorite !== right.isFavorite) {
        return left.isFavorite ? -1 : 1;
      }
      return projectRecency(right).localeCompare(projectRecency(left));
    });
  }, [filter, projects, query]);

  const activeCount = projects.filter((project) => project.status === 'active').length;
  const dueSoonCount = projects.filter(isProjectDueSoon).length;
  const setupCount = projects.filter(projectNeedsSetup).length;
  const readyCount = projects.filter(projectReadyToMake).length;

  async function handlePullToRefresh() {
    setIsPullRefreshing(true);
    try {
      await refreshProjects();
    } finally {
      setIsPullRefreshing(false);
    }
  }

  function confirmDeleteProject(project: Project) {
    if (!accessToken) return;
    Alert.alert(
      'Delete project?',
      `“${project.title}” will be permanently removed. Its linked pattern stays in your Library.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await stitchSenseAPI.deleteProject(project.id, accessToken);
              removeProject(project.id);
            } catch {
              Alert.alert('Could not delete project', 'Please try again in a moment.');
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isPullRefreshing}
          tintColor={tokens.color.primary}
          onRefresh={() => void handlePullToRefresh()}
        />
      }
      style={styles.screen}>
      <ScreenHero
        copy="A calmer place to keep every cast-on, repeat, note, and deadline close at hand."
        eyebrow="Projects"
        icon="folder-multiple-outline"
        title="Your making table">
        <View style={styles.projectStatsGrid}>
          <ProjectStat
            icon="play-circle-outline"
            label="Active"
            onPress={() => setFilter('active')}
            value={activeCount}
          />
          <ProjectStat
            icon="check-circle-outline"
            label="Ready"
            onPress={() => setFilter('ready')}
            value={readyCount}
          />
          <ProjectStat
            icon="playlist-edit"
            label="Need setup"
            onPress={() => setFilter('setup')}
            value={setupCount}
          />
          <ProjectStat
            icon="calendar-clock-outline"
            label="Due soon"
            onPress={() => setFilter('due')}
            value={dueSoonCount}
          />
        </View>

        <BrandButton
          label="Create a project"
          onPress={() => router.push('/project/new')}
          style={[styles.fullWidth, styles.createProjectButton]}
        />
      </ScreenHero>

      <Text style={styles.listHeading}>Your Projects</Text>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons color="#9b867d" name="magnify" size={20} />
        <TextInput
          autoCapitalize="sentences"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="Search projects, people, notes..."
          placeholderTextColor="#9b867d"
          style={styles.search}
          value={query}
        />
      </View>

      <Text style={styles.resultSummary}>
        Showing {filteredProjects.length} of {projects.length} projects
        {query.trim() ? ` · "${query.trim()}"` : ''}
      </Text>

      {errorMessage ? (
        <View style={styles.notice}>
          <View style={styles.noticeHeader}>
            <MaterialCommunityIcons color={tokens.color.danger} name="alert-circle-outline" size={20} />
            <Text style={styles.noticeTitle}>Couldn’t refresh projects</Text>
          </View>
          <Text style={styles.noticeText}>{errorMessage}</Text>
          <BrandButton label="Retry" onPress={() => void refreshProjects()} variant="ghost" />
        </View>
      ) : null}

      <View style={styles.list}>
        {isLoading && projects.length === 0 ? (
          <>
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
          </>
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            actionLabel="Create your first project"
            copy={
              filter === 'all'
                ? 'Pick any pattern from your library and turn it into a live project. You can use the same pattern multiple times for different people, sizes, or variations.'
                : 'No projects match this view yet. Try another filter or create a fresh project.'
            }
            icon="notebook-outline"
            onActionPress={() => router.push('/project/new')}
            title="No projects yet"
          />
        ) : (
          filteredProjects.map((project: Project, index) => (
            <SwipeToDelete
              key={project.id}
              entranceDelay={Math.min(index * 55, 275)}
              label="Delete"
              onDelete={() => confirmDeleteProject(project)}>
              <ProjectCard
                project={project}
                nextAction={nextProjectAction(project)}
                onPress={() => router.push(`/project/${project.id}`)}
              />
            </SwipeToDelete>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingBottom: tokens.spacing.xxl,
    paddingTop: 0,
    gap: tokens.spacing.xl2,
  },
  projectStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
    justifyContent: 'space-between',
  },
  projectStat: {
    flexBasis: '48%',
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 82,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.12)',
    backgroundColor: 'rgba(255, 253, 250, 0.97)',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    ...shadows.card,
  },
  projectStatValue: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 33,
  },
  projectStatMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    justifyContent: 'space-between',
  },
  projectStatLabel: {
    color: '#253d38',
    flex: 1,
    fontFamily: tokens.font.body,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    lineHeight: 13,
    textTransform: 'uppercase',
  },
  fullWidth: {
    width: '100%',
  },
  createProjectButton: {
    marginTop: tokens.spacing.md,
  },
  commandPanel: {
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: '#c5e1df',
    backgroundColor: '#f4fbfb',
    padding: tokens.spacing.lg,
    ...shadows.soft,
  },
  commandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  commandCopy: {
    flex: 1,
    gap: 4,
  },
  commandOpenButton: {
    minHeight: 40,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandOpenText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  commandGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  commandTile: {
    width: '31%',
    minHeight: 88,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  commandTileValue: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '900',
  },
  commandTileLabel: {
    color: tokens.color.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  focusPanel: {
    gap: tokens.spacing.md,
  },
  focusHeader: {
    gap: 4,
  },
  focusEyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  focusTitle: {
    color: tokens.color.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '900',
  },
  focusList: {
    gap: tokens.spacing.sm,
  },
  focusCard: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  focusIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.large,
    backgroundColor: '#f6eadf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  focusCopyBlock: {
    flex: 1,
    gap: 4,
  },
  focusCardTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '900',
  },
  focusCardCopy: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  setupQueueCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: '#dbc3ac',
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  readyQueueCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: 'rgba(63, 143, 85, 0.22)',
    backgroundColor: '#f2f8f0',
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  completedQueueCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: 'rgba(63, 143, 85, 0.2)',
    backgroundColor: '#f6fbf4',
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  quietQueueCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: '#ead7b7',
    backgroundColor: '#fff8ec',
    padding: tokens.spacing.md,
    ...shadows.soft,
  },
  setupQueueIcon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.large,
    backgroundColor: '#f6eadf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setupQueueCopy: {
    flex: 1,
    gap: 4,
  },
  setupQueueTitle: {
    color: tokens.color.text,
    fontSize: 15,
    fontWeight: '900',
  },
  setupQueueText: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 19,
  },
  setupQueueAction: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 9,
  },
  setupQueueActionText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  listHeading: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 24,
    letterSpacing: 0,
    lineHeight: 29,
  },
  searchWrap: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  search: {
    color: tokens.color.text,
    fontFamily: tokens.font.body,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
    flex: 1,
  },
  notice: {
    gap: tokens.spacing.md,
    padding: tokens.spacing.lg,
    borderRadius: tokens.radius.xlarge,
    borderWidth: 1,
    borderColor: '#e7b1a8',
    backgroundColor: '#fff0ec',
    ...shadows.soft,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  noticeTitle: {
    color: tokens.color.danger,
    fontSize: 16,
    fontWeight: '800',
  },
  noticeText: {
    color: tokens.color.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  filterPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  filterPillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  filterPillText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  resultSummary: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 19,
  },
  list: {
    gap: tokens.spacing.md,
  },
  skeletonCard: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    alignItems: 'center',
    borderRadius: tokens.radius.xlarge,
    backgroundColor: '#fffdf9',
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.md,
    ...shadows.card,
  },
  skeletonThumb: {
    width: 92,
    height: 92,
    borderRadius: tokens.radius.large,
    backgroundColor: '#f2e8de',
  },
  skeletonBody: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  skeletonLineLg: {
    height: 20,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#f2e8de',
    width: '78%',
  },
  skeletonLineMd: {
    height: 14,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#f4ede5',
    width: '62%',
  },
  skeletonLineSm: {
    height: 12,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#f7f1ea',
    width: '48%',
  },
  pressed: {
    opacity: 0.78,
  },
});
