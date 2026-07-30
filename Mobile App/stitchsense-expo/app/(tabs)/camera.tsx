import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AppCard } from '@/src/components/ui/app-card';
import { BrandButton } from '@/src/components/ui/brand-button';
import { RichMarkdownText } from '@/src/components/ui/rich-markdown-text';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';
import { APIError, stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import { loadVisionCache, saveVisionCache } from '@/src/lib/vision-cache';
import { useSession } from '@/src/providers/session-provider';
import { tokens } from '@/src/theme/tokens';

const questionPresets = [
  'What stitch is this?',
  'Does my tension look even?',
  'Is this twisted?',
  'Can you spot the mistake?',
  'What should I do next?',
] as const;

export default function CameraScreen() {
  const router = useRouter();
  const { accessToken, user } = useSession();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [resultText, setResultText] = useState('');
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    async function restore() {
      if (!user?.id) {
        return;
      }

      try {
        const cached = await loadVisionCache(user.id);
        if (!cached) {
          return;
        }
        setQuestion(cached.question);
        setResultText(cached.resultText);
        setImageUri(cached.imageUri);
        setLastSavedAt(cached.updatedAt);
      } catch {
        // Best-effort restore only.
      }
    }

    void restore();
  }, [user?.id]);

  async function chooseFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Photo library permission is required for Stitch Vision.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageDataUri(
      asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : null,
    );
    setResultText('');
    setLastSavedAt(null);
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Camera permission is required for Stitch Vision.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
      base64: true,
    });

    if (result.canceled || !result.assets?.[0]) {
      return;
    }

    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageDataUri(
      asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : null,
    );
    setResultText('');
    setLastSavedAt(null);
  }

  function clearPhoto() {
    setImageUri(null);
    setImageDataUri(null);
    setQuestion('');
    setResultText('');
    setLastSavedAt(null);
  }

  function askFollowUp() {
    const prompt = [
      'I used Stitch Vision on a photo and want help deciding what to do next.',
      question.trim() ? `My question was: ${question.trim()}` : null,
      resultText.trim() ? `Vision answer: ${resultText.trim()}` : null,
      'Please turn this into clear next steps.',
    ]
      .filter(Boolean)
      .join('\n\n');

    router.push({
      pathname: '/(tabs)/chat',
      params: {
        title: 'Stitch Vision follow-up',
        prompt,
        context: 'The user is following up after Stitch Vision photo analysis.',
        toolMode: 'stitch_vision_follow_up',
      },
    });
  }

  async function analysePhoto() {
    if (!accessToken || !imageDataUri) {
      return;
    }

    setIsAnalysing(true);
    setResultText('');

    try {
      const effectiveQuestion = question.trim() || 'What stitch or issue is visible?';
      const response = await stitchSenseAPI.analyseVision(accessToken, {
        imageDataUri,
        question: effectiveQuestion,
        skillLevel: 'beginner',
        toolMode: 'stitch_image_analysis',
      });

      const result = response.result;
      let nextResultText = '';
      if (typeof result === 'string') {
        nextResultText = result;
      } else if (result && typeof result === 'object' && 'answer' in result) {
        nextResultText = String((result as { answer: unknown }).answer);
      } else {
        nextResultText = JSON.stringify(result, null, 2);
      }

      setResultText(nextResultText);
      if (user?.id) {
        await saveVisionCache(user.id, {
          question: effectiveQuestion,
          resultText: nextResultText,
          imageUri,
        });
        setLastSavedAt(new Date().toISOString());
      }
    } catch (error) {
      if (error instanceof APIError) {
        setResultText(error.message);
      } else if (error instanceof Error) {
        setResultText(
          getUserFacingErrorMessage(error, {
            fallback: 'Sorry, Stitch Vision could not analyse that photo just now.',
          }),
        );
      } else {
        setResultText('Sorry, Stitch Vision could not analyse that photo just now.');
      }
    } finally {
      setIsAnalysing(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.screen}>
      <InlineBackButton
        onPress={() =>
          router.canGoBack() ? router.back() : router.replace('/(tabs)/dashboard')
        }
      />
      <ScreenHero
        copy="Upload a clear close-up of your knitting or crochet. StitchSense can help identify stitches, tension issues, and likely mistakes."
        eyebrow="Stitch Vision"
        icon="camera-outline"
        title="Photo help for stitches">
        <View style={styles.heroNote}>
          <Text style={styles.heroNoteEyebrow}>Best results</Text>
          <Text style={styles.heroNoteCopy}>Close-up, even light, several stitches in frame.</Text>
        </View>
      </ScreenHero>

      <AppCard elevated style={styles.card}>
        <Text style={styles.sectionTitle}>Upload photo</Text>
        <View style={styles.flowRow}>
          <View style={[styles.flowStep, imageUri ? styles.flowStepDone : null]}>
            <Text style={[styles.flowStepText, imageUri ? styles.flowStepTextDone : null]}>1 Photo</Text>
          </View>
          <View style={[styles.flowStep, question.trim() ? styles.flowStepDone : null]}>
            <Text style={[styles.flowStepText, question.trim() ? styles.flowStepTextDone : null]}>2 Question</Text>
          </View>
          <View style={[styles.flowStep, resultText ? styles.flowStepDone : null]}>
            <Text style={[styles.flowStepText, resultText ? styles.flowStepTextDone : null]}>3 Result</Text>
          </View>
        </View>
        <View style={styles.actionStack}>
          <BrandButton label="Choose photo" onPress={() => void chooseFromLibrary()} style={styles.fullWidth} />
          <BrandButton label="Take photo" onPress={() => void takePhoto()} style={styles.fullWidth} variant="ghost" />
        </View>
        <Text style={styles.helpText}>
          JPG, PNG, WebP, or HEIC. Bright, even lighting works best.
        </Text>

        <View style={styles.previewShell}>
          {imageUri ? (
            <Image contentFit="cover" source={{ uri: imageUri }} style={styles.previewImage} />
          ) : (
            <Text style={styles.previewEmpty}>Preview appears here.</Text>
          )}
        </View>

        <TextInput
          multiline
          onChangeText={setQuestion}
          placeholder="e.g. Is this twisted? What stitch is this? Does my tension look even?"
          placeholderTextColor="#9b867d"
          style={styles.questionInput}
          value={question}
        />
        <View style={styles.presetRow}>
          {questionPresets.map((preset) => (
            <Pressable key={preset} onPress={() => setQuestion(preset)} style={styles.presetChip}>
              <Text style={styles.presetChipText}>{preset}</Text>
            </Pressable>
          ))}
        </View>

        <BrandButton
          disabled={!imageDataUri}
          label="Analyse photo"
          loading={isAnalysing}
          onPress={() => void analysePhoto()}
          style={styles.fullWidth}
        />
        {imageUri ? (
          <BrandButton
            label="Clear photo"
            onPress={clearPhoto}
            style={styles.fullWidth}
            variant="ghost"
          />
        ) : null}
      </AppCard>

      <AppCard elevated style={styles.card}>
        <Text style={styles.sectionTitle}>Image analysis</Text>
        {lastSavedAt ? (
          <Text style={styles.savedMeta}>
            Last saved analysis: {new Date(lastSavedAt).toLocaleString()}
          </Text>
        ) : null}
        {isAnalysing ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={tokens.color.primary} />
            <Text style={styles.loadingText}>Analysing your photo…</Text>
          </View>
        ) : (
          <RichMarkdownText
            text={
              resultText ||
              'Upload a photo to start. If the image endpoint is not configured yet, I’ll tell you clearly.'
            }
          />
        )}
        {resultText && !isAnalysing ? (
          <View style={styles.resultActions}>
            <BrandButton
              label="Ask follow-up"
              onPress={askFollowUp}
              style={styles.resultButton}
              variant="secondary"
            />
            <BrandButton
              label="Analyse again"
              disabled={!imageDataUri}
              onPress={() => void analysePhoto()}
              style={styles.resultButton}
              variant="ghost"
            />
          </View>
        ) : null}
      </AppCard>

      <AppCard elevated style={styles.card}>
        <Text style={styles.sectionTitle}>Pro tips</Text>
        <View style={styles.tipList}>
          <Text style={styles.tipItem}>• Use bright, even lighting.</Text>
          <Text style={styles.tipItem}>• Lay the fabric flat.</Text>
          <Text style={styles.tipItem}>• Keep the camera close, but not blurry.</Text>
          <Text style={styles.tipItem}>• Include several stitches, not just one.</Text>
          <Text style={styles.tipItem}>• Avoid heavy shadows and busy backgrounds.</Text>
        </View>
      </AppCard>
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
    gap: tokens.spacing.xl2,
  },
  card: {
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
  },
  sectionTitle: {
    color: tokens.color.text,
    fontSize: 20,
    fontWeight: '800',
  },
  actionStack: {
    gap: tokens.spacing.sm,
  },
  flowRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  flowStep: {
    flexGrow: 1,
    minWidth: 92,
    minHeight: 38,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  flowStepDone: {
    backgroundColor: '#e7f4eb',
    borderColor: 'rgba(63, 143, 85, 0.22)',
  },
  flowStepText: {
    color: tokens.color.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  flowStepTextDone: {
    color: tokens.color.success,
  },
  fullWidth: {
    width: '100%',
  },
  heroNote: {
    gap: 4,
  },
  heroNoteEyebrow: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroNoteCopy: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '700',
  },
  helpText: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  previewShell: {
    minHeight: 220,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fcf5ed',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 220,
  },
  previewEmpty: {
    color: tokens.color.muted,
    fontSize: 15,
  },
  questionInput: {
    minHeight: 110,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: '#fcf5ed',
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  presetChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  presetChipText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  loadingText: {
    color: tokens.color.muted,
    fontSize: 15,
  },
  savedMeta: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  resultActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  resultButton: {
    flexGrow: 1,
    minWidth: 138,
  },
  tipList: {
    gap: tokens.spacing.xs,
  },
  tipItem: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
});
