import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { stitchSenseAPI } from '@/src/lib/api';
import {
  patternUploadErrorMessage,
  stripPatternFileExtension,
  uploadPatternWithRollback,
} from '@/src/lib/pattern-upload-flow';
import { loadTokens } from '@/src/lib/token-store';
import { useLibrary } from '@/src/providers/library-provider';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

const craftOptions = ['knitting', 'crochet'] as const;
const BUILD_STAMP = 'DEV BUILD JUNE 23 UPLOAD-D';

export default function PatternUploadScreen() {
  const router = useRouter();
  const { accessToken, refreshAccount } = useSession();
  const { refreshPatterns } = useLibrary();

  const [selectedFile, setSelectedFile] =
    useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [title, setTitle] = useState('');
  const [craftType, setCraftType] = useState<(typeof craftOptions)[number]>('knitting');
  const [sourceUrl, setSourceUrl] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const suggestedTitle = useMemo(() => {
    if (!selectedFile?.name) {
      return '';
    }
    return stripPatternFileExtension(selectedFile.name);
  }, [selectedFile?.name]);

  async function handlePickDocument() {
    setIsPicking(true);
    setStatusMessage(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/octet-stream'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];
      setSelectedFile(asset);
      setTitle((current) => current || stripPatternFileExtension(asset.name));
      setStatusMessage('Pattern file selected and ready to upload.');
    } catch (error) {
      setStatusMessage(patternUploadErrorMessage(error));
    } finally {
      setIsPicking(false);
    }
  }

  async function handleUpload() {
    if (!accessToken || !selectedFile) {
      return;
    }

    setIsUploading(true);

    try {
      const createdPattern = await uploadPatternWithRollback(
        {
          accessToken,
          selectedFile,
          title,
          suggestedTitle,
          craftType,
          sourceUrl,
        },
        {
          api: stitchSenseAPI,
          loadTokens,
          refreshAccount,
          refreshPatterns,
          onStatus: setStatusMessage,
        },
      );

      Alert.alert('Upload complete', 'Your pattern is now in your StitchSense library.');
      router.replace(`/pattern/${createdPattern.id}`);
    } catch (error) {
      setStatusMessage(patternUploadErrorMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Upload pattern</Text>
        <Text style={styles.title}>Add a pattern from your device</Text>
        <Text style={styles.copy}>
          Choose a PDF, give it a clean title, and StitchSense will place it straight into your
          shared library.
        </Text>
        <Text style={styles.buildStamp}>{BUILD_STAMP}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Pattern file</Text>
        <BrandButton
          label={isPicking ? 'Opening files…' : selectedFile ? 'Choose a different file' : 'Choose PDF'}
          loading={isPicking}
          onPress={() => void handlePickDocument()}
          style={styles.fullWidth}
        />
        {selectedFile ? (
          <View style={styles.fileCard}>
            <Text style={styles.fileName}>{selectedFile.name}</Text>
            <Text style={styles.fileMeta}>
              {selectedFile.mimeType ?? 'PDF'}
              {selectedFile.size ? ` · ${Math.round(selectedFile.size / 1024)} KB` : ''}
            </Text>
          </View>
        ) : (
          <Text style={styles.helper}>
            Pick the PDF version of your pattern so it can open cleanly in both mobile and web
            library views.
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Details</Text>
        <TextInput
          onChangeText={setTitle}
          placeholder="Pattern title"
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={title}
        />
        <View style={styles.craftRow}>
          {craftOptions.map((option) => {
            const active = craftType === option;
            return (
              <BrandButton
                key={option}
                label={option === 'knitting' ? 'Knitting' : 'Crochet'}
                onPress={() => setCraftType(option)}
                style={styles.craftButton}
                labelStyle={styles.craftButtonLabel}
                variant={active ? 'primary' : 'ghost'}
              />
            );
          })}
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setSourceUrl}
          placeholder="Optional source URL"
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={sourceUrl}
        />
        <Text style={styles.helper}>
          Add the original listing URL if you want a clean reference back to the source later.
        </Text>
      </View>

      {statusMessage ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{statusMessage}</Text>
        </View>
      ) : null}

      <BrandButton
        disabled={!selectedFile || !accessToken}
        label={isUploading ? 'Uploading…' : 'Upload to StitchSense'}
        loading={isUploading}
        onPress={() => void handleUpload()}
        style={styles.fullWidth}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  content: {
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  hero: {
    backgroundColor: '#fffaf6',
    borderRadius: tokens.radius.sheet,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  buildStamp: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: 21,
    fontWeight: '700',
  },
  fileCard: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  fileName: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '700',
  },
  fileMeta: {
    color: tokens.color.muted,
    fontSize: 13,
  },
  helper: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 20,
  },
  input: {
    minHeight: tokens.component.controlHeight,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    fontSize: 16,
  },
  craftRow: {
    flexDirection: 'row',
    gap: tokens.spacing.sm,
  },
  craftButton: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: tokens.spacing.sm,
  },
  craftButtonLabel: {
    fontSize: 13,
  },
  notice: {
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fff7f0',
    padding: tokens.spacing.md,
  },
  noticeText: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  fullWidth: {
    width: '100%',
  },
});
