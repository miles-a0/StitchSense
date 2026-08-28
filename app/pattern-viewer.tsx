import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { BrandButton } from '@/src/components/ui/brand-button';
import { stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { ProjectPatternMark } from '@/src/lib/models';
import { loadTokens } from '@/src/lib/token-store';
import { useProjects } from '@/src/providers/projects-provider';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

export default function PatternViewerScreen() {
  const router = useRouter();
  const { id, title, projectId } = useLocalSearchParams<{
    id: string;
    title?: string;
    projectId?: string;
  }>();
  const { accessToken, refreshAccount } = useSession();
  const { projects } = useProjects();

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileAuthToken, setFileAuthToken] = useState<string | null>(null);
  const [systemFileUrl, setSystemFileUrl] = useState<string | null>(null);
  const [patternTitle, setPatternTitle] = useState(title ?? 'Pattern file');
  const [statusMessage, setStatusMessage] = useState('Preparing your pattern file…');
  const [isLoading, setIsLoading] = useState(true);
  const [viewerFailed, setViewerFailed] = useState(false);
  const [projectMarks, setProjectMarks] = useState<ProjectPatternMark[]>([]);
  const [markerStatus, setMarkerStatus] = useState<string | null>(null);
  const [markerPage, setMarkerPage] = useState('');
  const [markerLocation, setMarkerLocation] = useState('');
  const [markerNote, setMarkerNote] = useState('');
  const [markersExpanded, setMarkersExpanded] = useState(false);
  const [markersCollapsed, setMarkersCollapsed] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  const canUseInlineViewer = Platform.OS !== 'android';
  const encodedTitle = useMemo(() => patternTitle.trim() || 'Pattern file', [patternTitle]);
  const activeProject = useMemo(() => {
    if (projectId) {
      return projects.find((project) => project.id === projectId) ?? null;
    }
    return null;
  }, [projectId, projects]);
  const canUseProjectMarkers = Boolean(activeProject);

  const currentAccessToken = useCallback(async () => {
    await refreshAccount();
    const saved = await loadTokens();
    return saved.accessToken ?? accessToken;
  }, [accessToken, refreshAccount]);

  const loadFile = useCallback(async () => {
    if (!id) {
      setIsLoading(false);
      setStatusMessage('No pattern was selected.');
      return;
    }

    setIsLoading(true);
    setViewerFailed(false);
    setStatusMessage('Preparing your pattern file…');
    try {
      const activeToken = await currentAccessToken();
      if (!activeToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }

      const pattern = await stitchSenseAPI.pattern(id, activeToken);
      setPatternTitle(pattern.title || title || 'Pattern file');

      if (!pattern.fileKey && !pattern.fileUrl) {
        setFileUrl(null);
        setSystemFileUrl(null);
        setStatusMessage('No pattern file is linked to this library item yet.');
        return;
      }

      setFileAuthToken(activeToken);
      setFileUrl(stitchSenseAPI.patternFileApiUrl(id));
      try {
        const fileResponse = await stitchSenseAPI.patternFileUrl(id, activeToken);
        setSystemFileUrl(fileResponse.fileUrl ?? null);
      } catch {
        setSystemFileUrl(null);
      }
      setStatusMessage('Pattern file ready.');
    } catch (error) {
      setFileUrl(null);
      setSystemFileUrl(null);
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not prepare this pattern file.' }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentAccessToken, id, title]);

  useEffect(() => {
    void loadFile();
  }, [loadFile]);

  const loadProjectMarkers = useCallback(async () => {
    if (!activeProject?.id) {
      setProjectMarks([]);
      setMarkerStatus(null);
      return;
    }

    try {
      const activeToken = await currentAccessToken();
      if (!activeToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      const marks = await stitchSenseAPI.projectMarks(activeProject.id, activeToken);
      setProjectMarks(marks);
      setMarkerStatus(marks.length ? `${marks.length} project marker${marks.length === 1 ? '' : 's'} synced.` : null);
    } catch (error) {
      setMarkerStatus(
        getUserFacingErrorMessage(error, { fallback: 'Could not load project markers.' }),
      );
    }
  }, [activeProject?.id, currentAccessToken]);

  useFocusEffect(
    useCallback(() => {
      void loadProjectMarkers();
    }, [loadProjectMarkers]),
  );

  async function saveProjectMarker() {
    if (!activeProject?.id) {
      return;
    }

    const pageNumber = markerPage.trim() ? Number(markerPage) : null;
    if (markerPage.trim() && (!Number.isFinite(pageNumber) || Number(pageNumber) <= 0)) {
      setMarkerStatus('Use a valid page number for this marker.');
      return;
    }
    if (!markerLocation.trim() && !markerNote.trim() && !markerPage.trim()) {
      setMarkerStatus('Add a page, row, section, or note first.');
      return;
    }

    try {
      const activeToken = await currentAccessToken();
      if (!activeToken) {
        throw new Error('Your session has expired. Please sign in again.');
      }
      if (selectedMarkerId) {
        await stitchSenseAPI.deleteProjectMark(activeProject.id, selectedMarkerId, activeToken);
      }
      const saved = await stitchSenseAPI.createProjectMark(activeProject.id, activeToken, {
        type: markerNote.trim() && !markerLocation.trim() ? 'annotation' : 'bookmark',
        label: markerLocation.trim() || markerNote.trim().slice(0, 36) || 'PDF marker',
        pageNumber,
        locationLabel: markerLocation.trim() || null,
        note: markerNote.trim() || null,
        sortOrder: projectMarks.length,
      });
      setProjectMarks((current) =>
        [...current.filter((mark) => mark.id !== saved.id), saved].sort(
          (left, right) => left.sortOrder - right.sortOrder,
        ),
      );
      setMarkerPage('');
      setMarkerLocation('');
      setMarkerNote('');
      setSelectedMarkerId(null);
      setMarkersExpanded(true);
      setMarkerStatus(selectedMarkerId ? 'Marker updated in this project.' : 'Marker saved to this project.');
    } catch (error) {
      setMarkerStatus(
        getUserFacingErrorMessage(error, { fallback: 'Could not save this marker.' }),
      );
    }
  }

  function editProjectMarker(mark: ProjectPatternMark) {
    setSelectedMarkerId(mark.id);
    setMarkerPage(mark.pageNumber ? String(mark.pageNumber) : '');
    setMarkerLocation(mark.locationLabel ?? (mark.label === 'Pattern note' ? '' : mark.label));
    setMarkerNote(mark.note ?? '');
    setMarkersExpanded(true);
    setMarkerStatus('Editing marker. Save to update it.');
  }

  function clearMarkerForm() {
    setSelectedMarkerId(null);
    setMarkerPage('');
    setMarkerLocation('');
    setMarkerNote('');
    setMarkerStatus(null);
  }

  function confirmDeleteProjectMarker(mark: ProjectPatternMark) {
    if (!activeProject?.id) return;
    Alert.alert('Delete marker?', markerSummary(mark) || 'Remove this project marker?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const activeToken = await currentAccessToken();
            if (!activeToken) {
              throw new Error('Your session has expired. Please sign in again.');
            }
            await stitchSenseAPI.deleteProjectMark(activeProject.id, mark.id, activeToken);
            setProjectMarks((current) => current.filter((item) => item.id !== mark.id));
            if (selectedMarkerId === mark.id) {
              clearMarkerForm();
            }
            setMarkerStatus('Marker deleted.');
          } catch (error) {
            setMarkerStatus(
              getUserFacingErrorMessage(error, { fallback: 'Could not delete this marker.' }),
            );
          }
        },
      },
    ]);
  }

  async function openFallback() {
    const targetUrl = systemFileUrl ?? fileUrl;
    if (!targetUrl) {
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(targetUrl);
    } catch (error) {
      setStatusMessage(
        getUserFacingErrorMessage(error, { fallback: 'Could not open this pattern file.' }),
      );
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color={tokens.color.primary} size="large" />
        <Text style={styles.loadingText}>{statusMessage}</Text>
      </View>
    );
  }

  if (!fileUrl || !canUseInlineViewer || viewerFailed) {
    return (
      <ScrollView contentContainerStyle={styles.fallbackContent} style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Pattern viewer</Text>
          <Text style={styles.title}>{encodedTitle}</Text>
          <Text style={styles.body}>
            {fileUrl && !canUseInlineViewer
              ? 'This device needs to open the pattern file with the system viewer.'
              : viewerFailed
                ? 'The in-app viewer could not render this file. The pattern itself is still available.'
                : statusMessage}
          </Text>
          <View style={styles.actions}>
            {fileUrl ? (
              <BrandButton
                label="Open in system viewer"
                onPress={() => void openFallback()}
                style={styles.fullWidth}
              />
            ) : null}
            <BrandButton
              label="Back to pattern"
              onPress={() => router.back()}
              style={styles.fullWidth}
              variant="ghost"
            />
            {fileUrl ? (
              <BrandButton
                label="Retry in-app viewer"
                onPress={() => {
                  setViewerFailed(false);
                  setStatusMessage('Pattern file ready.');
                }}
                style={styles.fullWidth}
                variant="ghost"
              />
            ) : (
              <BrandButton
                label="Try again"
                onPress={() => void loadFile()}
                style={styles.fullWidth}
                variant="ghost"
              />
            )}
          </View>
          {canUseProjectMarkers ? (
            <ProjectMarkerTools
              activeProjectTitle={activeProject?.title}
              markersExpanded={markersExpanded}
              markersCollapsed={markersCollapsed}
              markerLocation={markerLocation}
              markerNote={markerNote}
              markerPage={markerPage}
              markerStatus={markerStatus}
              projectMarks={projectMarks}
              selectedMarkerId={selectedMarkerId}
              clearMarkerForm={clearMarkerForm}
              setMarkerLocation={setMarkerLocation}
              setMarkerNote={setMarkerNote}
              setMarkerPage={setMarkerPage}
              setMarkersCollapsed={setMarkersCollapsed}
              setMarkersExpanded={setMarkersExpanded}
              onDeleteMarker={confirmDeleteProjectMarker}
              onEditMarker={editProjectMarker}
              onOpenProject={() => router.push({ pathname: '/project/[id]', params: { id: activeProject!.id } })}
              onSaveMarker={() => void saveProjectMarker()}
            />
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={styles.viewerScreen}>
      <View style={styles.viewerHeader}>
        <View style={styles.viewerCopy}>
          <Text numberOfLines={1} style={styles.viewerTitle}>
            {encodedTitle}
          </Text>
          <Text style={styles.viewerMeta}>Private pattern file</Text>
          {activeProject ? (
            <Text numberOfLines={1} style={styles.viewerProjectMeta}>
              {activeProject.title} · {projectMarks.length} marker{projectMarks.length === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
        {activeProject ? (
          <Pressable
            onPress={() => router.push({ pathname: '/project/[id]', params: { id: activeProject.id } })}
            style={styles.viewerProjectButton}>
            <Text style={styles.viewerProjectButtonText}>Project</Text>
          </Pressable>
        ) : null}
        <BrandButton
          label="System"
          onPress={() => void openFallback()}
          style={styles.systemButton}
          variant="ghost"
        />
      </View>
      <WebView
        allowsBackForwardNavigationGestures
        originWhitelist={['*']}
        source={{
          uri: fileUrl,
          headers: fileAuthToken ? { Authorization: `Bearer ${fileAuthToken}` } : undefined,
        }}
        startInLoadingState
        onError={() => setViewerFailed(true)}
        onHttpError={() => setViewerFailed(true)}
        renderLoading={() => (
          <View style={styles.webLoading}>
            <ActivityIndicator color={tokens.color.primary} />
          </View>
        )}
        style={styles.webView}
      />
      {canUseProjectMarkers ? (
        <View style={styles.markerOverlay}>
          <ProjectMarkerTools
            activeProjectTitle={activeProject?.title}
            markersExpanded={markersExpanded}
            markersCollapsed={markersCollapsed}
            markerLocation={markerLocation}
            markerNote={markerNote}
            markerPage={markerPage}
            markerStatus={markerStatus}
            projectMarks={projectMarks}
            selectedMarkerId={selectedMarkerId}
            clearMarkerForm={clearMarkerForm}
            setMarkerLocation={setMarkerLocation}
            setMarkerNote={setMarkerNote}
            setMarkerPage={setMarkerPage}
            setMarkersCollapsed={setMarkersCollapsed}
            setMarkersExpanded={setMarkersExpanded}
            onDeleteMarker={confirmDeleteProjectMarker}
            onEditMarker={editProjectMarker}
            onOpenProject={() => router.push({ pathname: '/project/[id]', params: { id: activeProject!.id } })}
            onSaveMarker={() => void saveProjectMarker()}
          />
        </View>
      ) : null}
    </View>
  );
}

function markerSummary(mark: ProjectPatternMark) {
  return [
    mark.pageNumber ? `p.${mark.pageNumber}` : null,
    mark.locationLabel || mark.label,
    mark.note,
  ]
    .filter(Boolean)
    .join(' · ');
}

function ProjectMarkerTools({
  activeProjectTitle,
  markersExpanded,
  markersCollapsed,
  markerLocation,
  markerNote,
  markerPage,
  markerStatus,
  projectMarks,
  selectedMarkerId,
  clearMarkerForm,
  setMarkerLocation,
  setMarkerNote,
  setMarkerPage,
  setMarkersCollapsed,
  setMarkersExpanded,
  onDeleteMarker,
  onEditMarker,
  onOpenProject,
  onSaveMarker,
}: {
  activeProjectTitle?: string;
  markersExpanded: boolean;
  markersCollapsed: boolean;
  markerLocation: string;
  markerNote: string;
  markerPage: string;
  markerStatus: string | null;
  projectMarks: ProjectPatternMark[];
  selectedMarkerId: string | null;
  clearMarkerForm: () => void;
  setMarkerLocation: (value: string) => void;
  setMarkerNote: (value: string) => void;
  setMarkerPage: (value: string) => void;
  setMarkersCollapsed: (value: boolean) => void;
  setMarkersExpanded: (value: boolean) => void;
  onDeleteMarker: (mark: ProjectPatternMark) => void;
  onEditMarker: (mark: ProjectPatternMark) => void;
  onOpenProject: () => void;
  onSaveMarker: () => void;
}) {
  const visibleMarks = projectMarks.filter((mark) => mark.type !== 'resume').slice(0, 5);
  const resumeMark = projectMarks.find((mark) => mark.type === 'resume') ?? null;
  const annotationCount = projectMarks.filter((mark) => mark.type === 'annotation').length;
  const bookmarkCount = projectMarks.filter((mark) => mark.type === 'bookmark').length;

  function applyMarkerPreset(label: string, note?: string) {
    setMarkerLocation(label);
    if (note && !markerNote.trim()) {
      setMarkerNote(note);
    }
  }

  if (markersCollapsed) {
    return (
      <View style={[styles.markerPanel, styles.markerPanelCompact]}>
        <View style={styles.markerCompactRow}>
          <View style={styles.markerTitleBlock}>
            <Text style={styles.markerEyebrow}>Markers</Text>
            <Text numberOfLines={1} style={styles.markerTitle}>
              {projectMarks.length} saved{resumeMark?.pageNumber ? ` · resume p.${resumeMark.pageNumber}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => {
              setMarkersCollapsed(false);
              setMarkersExpanded(true);
            }}
            style={styles.markerIconButton}>
            <Text style={styles.markerIconButtonText}>Add</Text>
          </Pressable>
          <Pressable onPress={() => setMarkersCollapsed(false)} style={styles.markerIconButton}>
            <Text style={styles.markerIconButtonText}>Show</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.markerPanel}>
      <View style={styles.markerHeader}>
        <View style={styles.markerTitleBlock}>
          <Text style={styles.markerEyebrow}>Project markers</Text>
          <Text numberOfLines={1} style={styles.markerTitle}>
            {activeProjectTitle ?? 'Project'}
          </Text>
        </View>
        <View style={styles.markerHeaderActions}>
          <Pressable onPress={onOpenProject} style={styles.markerIconButton}>
            <Text style={styles.markerIconButtonText}>Project</Text>
          </Pressable>
          <Pressable onPress={() => setMarkersCollapsed(true)} style={styles.markerIconButton}>
            <Text style={styles.markerIconButtonText}>Min</Text>
          </Pressable>
          <Pressable
            onPress={() => setMarkersExpanded(!markersExpanded)}
            style={styles.markerIconButton}>
            <Text style={styles.markerIconButtonText}>{markersExpanded ? 'Hide' : 'Add'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.markerStatsRow}>
        <View style={styles.markerStatPill}>
          <Text style={styles.markerStatText}>{bookmarkCount} bookmarks</Text>
        </View>
        <View style={styles.markerStatPill}>
          <Text style={styles.markerStatText}>{annotationCount} notes</Text>
        </View>
        {resumeMark ? (
          <View style={styles.markerStatPill}>
            <Text style={styles.markerStatText}>
              Resume {resumeMark.pageNumber ? `p.${resumeMark.pageNumber}` : 'saved'}
            </Text>
          </View>
        ) : null}
      </View>

      {visibleMarks.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.markerChipRow}>
          {visibleMarks.map((mark) => (
            <Pressable
              key={mark.id}
              onPress={() => onEditMarker(mark)}
              style={[
                styles.markerChip,
                selectedMarkerId === mark.id ? styles.markerChipActive : null,
              ]}>
              <Text numberOfLines={1} style={styles.markerChipText}>
                {markerSummary(mark)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.markerHint}>No project markers yet.</Text>
      )}

      {markersExpanded ? (
        <View style={styles.markerForm}>
          <View style={styles.markerPresetRow}>
            {[
              ['Row', 'Mark the row or round I am working on.'],
              ['Repeat', 'Pattern repeat checkpoint.'],
              ['Sleeve', 'Sleeve shaping or cuff checkpoint.'],
              ['Cuff', 'Cuff or edge detail checkpoint.'],
              ['Mistake', 'Something to fix or check later.'],
            ].map(([label, note]) => (
              <Pressable
                key={label}
                onPress={() => applyMarkerPreset(label, note)}
                style={styles.markerPresetChip}>
                <Text style={styles.markerPresetText}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.markerFormRow}>
            <TextInput
              keyboardType="numeric"
              onChangeText={setMarkerPage}
              placeholder="Page"
              placeholderTextColor="#9b867d"
              style={[styles.markerInput, styles.markerPageInput]}
              value={markerPage}
            />
            <TextInput
              onChangeText={setMarkerLocation}
              placeholder="Row / section"
              placeholderTextColor="#9b867d"
              style={styles.markerInput}
              value={markerLocation}
            />
          </View>
          <TextInput
            multiline
            onChangeText={setMarkerNote}
            placeholder="Note for this point in the project"
            placeholderTextColor="#9b867d"
            style={[styles.markerInput, styles.markerNoteInput]}
            value={markerNote}
          />
          <BrandButton
            label={selectedMarkerId ? 'Update marker' : 'Save marker'}
            onPress={onSaveMarker}
            style={styles.fullWidth}
          />
          {selectedMarkerId ? (
            <View style={styles.markerFormActions}>
              <Pressable onPress={clearMarkerForm} style={styles.markerSmallAction}>
                <Text style={styles.markerSmallActionText}>Cancel edit</Text>
              </Pressable>
              {visibleMarks.find((mark) => mark.id === selectedMarkerId) ? (
                <Pressable
                  onPress={() => {
                    const mark = visibleMarks.find((item) => item.id === selectedMarkerId);
                    if (mark) onDeleteMarker(mark);
                  }}
                  style={styles.markerSmallAction}>
                  <Text style={[styles.markerSmallActionText, styles.markerDangerText]}>
                    Delete marker
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {markerStatus ? <Text style={styles.markerStatus}>{markerStatus}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
    backgroundColor: tokens.color.background,
  },
  loadingText: {
    color: tokens.color.muted,
    fontSize: tokens.type.body,
    textAlign: 'center',
  },
  fallbackContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  card: {
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
  },
  body: {
    color: tokens.color.muted,
    fontSize: tokens.type.body,
    lineHeight: 23,
  },
  actions: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  fullWidth: {
    width: '100%',
  },
  viewerScreen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  viewerCopy: {
    flex: 1,
    minWidth: 0,
  },
  viewerTitle: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '800',
  },
  viewerMeta: {
    color: tokens.color.muted,
    fontSize: 12,
    marginTop: 2,
  },
  viewerProjectMeta: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  viewerProjectButton: {
    minHeight: 42,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fff7ec',
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerProjectButtonText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  systemButton: {
    minHeight: 42,
    paddingHorizontal: tokens.spacing.md,
  },
  webView: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  webLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.background,
  },
  markerOverlay: {
    position: 'absolute',
    left: tokens.spacing.md,
    right: tokens.spacing.md,
    bottom: tokens.spacing.md,
  },
  markerPanel: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: 'rgba(255, 250, 245, 0.96)',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    shadowColor: '#2f2019',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  markerPanelCompact: {
    paddingVertical: tokens.spacing.sm,
  },
  markerCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  markerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing.md,
  },
  markerTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  markerEyebrow: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  markerTitle: {
    color: tokens.color.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  markerHeaderActions: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
  },
  markerIconButton: {
    minHeight: 34,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerIconButtonText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  markerStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  markerStatPill: {
    borderRadius: tokens.radius.pill,
    backgroundColor: '#f4e8dd',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 6,
  },
  markerStatText: {
    color: tokens.color.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  markerChipRow: {
    gap: tokens.spacing.sm,
    paddingRight: tokens.spacing.md,
  },
  markerChip: {
    maxWidth: 220,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#efe1d3',
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  markerChipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: '#fff7ec',
  },
  markerChipText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  markerHint: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  markerForm: {
    gap: tokens.spacing.sm,
  },
  markerPresetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.xs,
  },
  markerPresetChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fff7ec',
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: 7,
  },
  markerPresetText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  markerFormRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  markerInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 14,
  },
  markerPageInput: {
    flex: 0,
    width: 86,
  },
  markerNoteInput: {
    minHeight: 72,
    paddingTop: tokens.spacing.sm,
    textAlignVertical: 'top',
  },
  markerFormActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  markerSmallAction: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  markerSmallActionText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  markerDangerText: {
    color: tokens.color.danger,
  },
  markerStatus: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 17,
  },
});
