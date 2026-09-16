import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BrandButton } from '@/src/components/ui/brand-button';
import { RichMarkdownText } from '@/src/components/ui/rich-markdown-text';
import { ScreenHero } from '@/src/components/ui/screen-hero';
import { APIError, stitchSenseAPI } from '@/src/lib/api';
import { uploadChatDocumentContext } from '@/src/lib/chat-upload-flow';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { ChatMessage, ChatSession } from '@/src/lib/models';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useSession } from '@/src/providers/session-provider';
import { shadows, tokens } from '@/src/theme/tokens';

type ChatSkillLevel = 'beginner' | 'confident' | 'expert';
const WORKFLOW_MESSAGE_LIMIT = 1190;
const VISION_QUESTION_LIMIT = 1150;
const IMAGE_CONTEXT_PROMPT =
  'Image context only. Identify the visible item first, then craft/clues: shape, neckline/armholes, hem, texture, colour, yarn weight guess, and uncertainty. Do not invent a written pattern.';

type UploadedChatContext = {
  name: string;
  kind: 'image' | 'document';
  mimeType?: string | null;
  analysis?: string | null;
  imageDataUri?: string | null;
  patternId?: string | null;
  introMessage?: string | null;
};

type UploadOverlayPhase = 'choose' | 'selecting' | 'uploading' | 'processing' | 'done' | 'error';

function preferredChatLevel(defaultSkill: string): ChatSkillLevel {
  if (defaultSkill === 'advanced') {
    return 'expert';
  }
  if (defaultSkill === 'intermediate') {
    return 'confident';
  }
  return 'beginner';
}

async function imageDataUriFor(uri: string, mimeType?: string | null, base64?: string | null) {
  const encoded = base64 ?? await new File(uri).base64();
  return `data:${mimeType ?? 'image/jpeg'};base64,${encoded}`;
}

function clampVisionQuestion(value: string) {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length <= VISION_QUESTION_LIMIT
    ? compact
    : compact.slice(0, VISION_QUESTION_LIMIT - 1).trimEnd();
}

function chatError(error: unknown) {
  if (error instanceof APIError) {
    if (error.message.includes('Workflow chat failed with 401')) {
      return 'The StitchSense chat workflow rejected this request. The shared secret likely needs checking.';
    }
    if (error.message.includes('Workflow chat failed with 404')) {
      return 'The StitchSense chat workflow is not reachable yet.';
    }
    return error.message;
  }
  return getUserFacingErrorMessage(error, {
    fallback: 'Sorry, StitchSense could not answer just now.',
  });
}

function visionAnswerText(result: unknown) {
  if (typeof result === 'string') {
    return result;
  }
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    for (const key of ['answer', 'reply', 'response', 'content', 'text', 'output']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }
  return JSON.stringify(result, null, 2);
}

export default function ChatScreen() {
  const { context, prompt, title, toolMode } = useLocalSearchParams<{
    context?: string | string[];
    prompt?: string | string[];
    title?: string | string[];
    toolMode?: string | string[];
  }>();
  const paramValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
  const assistantContext = paramValue(context)?.trim() ?? '';
  const assistantTitle = paramValue(title)?.trim() ?? '';
  const assistantToolMode = paramValue(toolMode)?.trim() || 'general_craft_companion';
  const preparedPrompt = paramValue(prompt) ?? '';
  const isToolChat = Boolean(
    assistantTitle || assistantContext || assistantToolMode !== 'general_craft_companion',
  );
  const heroTitle = isToolChat && assistantTitle ? assistantTitle : "Let's talk about it!";
  const heroCopy =
    isToolChat && preparedPrompt
      ? preparedPrompt
      : 'Use this for knitting and crochet questions, inspiration, technique help, yarn choices, or a calm second opinion.';
  const { settings } = usePreferences();
  const { accessToken } = useSession();
  const scrollRef = useRef<ScrollView | null>(null);
  const messageLayouts = useRef<Record<number, number>>({});
  const pendingScrollMessageId = useRef<number | null>(null);
  const chatLaunchKeyRef = useRef<string | null>(null);
  const [draft, setDraft] = useState(preparedPrompt);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [skillLevel, setSkillLevel] = useState<ChatSkillLevel>(
    preferredChatLevel(settings.defaultSkill),
  );
  const [, setStatusMessage] = useState(
    'Ask anything about knitting, crochet, yarn, techniques, or what to make next.',
  );
  const [uploadedContext, setUploadedContext] = useState<UploadedChatContext | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [scrollTick, setScrollTick] = useState(0);
  const [uploadOverlayVisible, setUploadOverlayVisible] = useState(false);
  const [uploadOverlayPhase, setUploadOverlayPhase] = useState<UploadOverlayPhase>('choose');
  const [uploadOverlayMessage, setUploadOverlayMessage] = useState(
    'Choose a pattern, document, or image to use as the only context for this chat.',
  );

  useEffect(() => {
    setSkillLevel(preferredChatLevel(settings.defaultSkill));
  }, [settings.defaultSkill]);

  useEffect(() => {
    const launchKey = JSON.stringify({
      prompt: preparedPrompt,
      title: assistantTitle,
      context: assistantContext,
      toolMode: assistantToolMode,
    });
    if (chatLaunchKeyRef.current !== launchKey) {
      chatLaunchKeyRef.current = launchKey;
      messageLayouts.current = {};
      pendingScrollMessageId.current = null;
      setMessages([]);
      setSession(null);
      setUploadedContext(null);
      setIsSending(false);
    }

    if (preparedPrompt) {
      if (isToolChat) {
        setDraft('');
        setStatusMessage(`${assistantTitle || 'Assistant'} ready. Ask your question when you are ready.`);
      } else {
        setDraft(preparedPrompt);
        setStatusMessage('Question prepared. Edit it or send when ready.');
      }
    } else {
      setDraft('');
      setStatusMessage('Ask anything about knitting, crochet, yarn, techniques, or what to make next.');
    }
  }, [assistantContext, assistantTitle, assistantToolMode, isToolChat, preparedPrompt]);

  useEffect(() => {
    const pendingId = pendingScrollMessageId.current;
    if (!pendingId) {
      return;
    }

    const timeout = setTimeout(() => {
      scrollToMessage(pendingId);
    }, 80);

    return () => clearTimeout(timeout);
  }, [messages.length, scrollTick]);

  function scrollToMessage(messageId: number) {
    const y = messageLayouts.current[messageId];
    if (typeof y !== 'number') {
      return;
    }

    scrollRef.current?.scrollTo({
      y: Math.max(0, y - tokens.spacing.sm),
      animated: true,
    });
    pendingScrollMessageId.current = null;
  }

  function requestScrollToMessage(messageId: number) {
    pendingScrollMessageId.current = messageId;
    setScrollTick((current) => current + 1);
  }

  const uploadedContextText = uploadedContext && !uploadedContext.patternId
    ? [
        `File: ${uploadedContext.name}.`,
        `Type: ${uploadedContext.kind}${uploadedContext.mimeType ? ` (${uploadedContext.mimeType})` : ''}.`,
        uploadedContext.analysis
          ? `Image context: ${uploadedContext.analysis.slice(0, 420)}`
          : 'The user loaded this file as context. If detail is missing, ask one concise follow-up.',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  function isGuideStylePrompt(value: string) {
    return /row\s*by\s*row|round\s*by\s*round|step\s*by\s*step|detailed\s+guide|complete\s+guide|full\s+guide|how\s+do\s+i\s+make|guide\s+to\s+making/i.test(value);
  }

  function toolModeForPrompt(value: string) {
    if (uploadedContext?.patternId && isGuideStylePrompt(value)) {
      return 'pattern_step_guide';
    }
    if (uploadedContext?.patternId) {
      return 'pattern_chat';
    }
    return assistantToolMode;
  }

  function compactChatContext() {
    return [
      assistantTitle ? `Selected assistant: ${assistantTitle}.` : null,
      isToolChat && preparedPrompt ? `Assistant prompt: ${preparedPrompt.slice(0, 420)}` : null,
      assistantContext ? `Assistant context: ${assistantContext.slice(0, 420)}` : null,
      uploadedContextText,
    ]
      .filter(Boolean)
      .join('\n');
  }

  function workflowMessageFor(prompt: string) {
    const context = compactChatContext();
    const message = context ? `${prompt}\n\n${context}` : prompt;
    if (message.length <= WORKFLOW_MESSAGE_LIMIT) {
      return message;
    }

    const allowedPromptLength = Math.max(240, WORKFLOW_MESSAGE_LIMIT - context.length - 2);
    const trimmedPrompt =
      prompt.length > allowedPromptLength
        ? `${prompt.slice(0, allowedPromptLength - 1).trimEnd()}…`
        : prompt;
    const compactMessage = context ? `${trimmedPrompt}\n\n${context}` : trimmedPrompt;
    return compactMessage.length <= WORKFLOW_MESSAGE_LIMIT
      ? compactMessage
      : compactMessage.slice(0, WORKFLOW_MESSAGE_LIMIT - 1).trimEnd();
  }

	  async function handleSend(
	    rawPrompt?: string,
	    options?: { optimistic?: boolean },
	  ) {
    const prompt = (rawPrompt ?? draft).trim();
    if (!prompt || !accessToken) {
      return;
    }

    Keyboard.dismiss();
    setDraft('');
    setIsSending(true);
    setStatusMessage('StitchSense is thinking with you...');

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: prompt,
      createdAt: new Date().toISOString(),
    };

	    if (options?.optimistic !== false) {
	      setMessages((current) => [...current, userMessage]);
	      requestScrollToMessage(userMessage.id);
	    }
	
	    try {
	      if (uploadedContext?.kind === 'image' && uploadedContext.imageDataUri) {
	        const visionPrompt = clampVisionQuestion([
	          'Use only this uploaded image. Do not use any previous pattern/chat.',
	          'Identify the visible item first; never answer for socks/gloves/jumpers unless visible.',
	          'If asked how to make it, give an image-inspired design recipe, not exact rows unless a pattern is supplied.',
	          'For medium fit, give sensible measurements/checkpoints and ask only for missing essentials.',
	          uploadedContext.analysis ? `Image notes: ${uploadedContext.analysis.slice(0, 320)}` : null,
	          `User: ${prompt}`,
	        ].filter(Boolean).join('\n'));
	        const response = await stitchSenseAPI.analyseVision(accessToken, {
	          imageDataUri: uploadedContext.imageDataUri,
	          question: visionPrompt,
	          skillLevel,
	          toolMode: 'stitch_image_analysis',
	        });
        const answer = visionAnswerText(response.result);
        const assistantMessage: ChatMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: answer,
          createdAt: new Date().toISOString(),
        };
        setMessages((current) => [...current, assistantMessage]);
        requestScrollToMessage(assistantMessage.id);
        setStatusMessage('Conversation updated.');
        return;
      }

	      let activeSession = session;
	      if (!activeSession) {
	        const created = await stitchSenseAPI.createChat(
          uploadedContext?.patternId ?? null,
          uploadedContext?.patternId ? `${uploadedContext.name} chat` : 'General StitchSense chat',
          accessToken,
          skillLevel,
        );
        activeSession = created.session;
        setSession(created.session);
      }

      const messageToSend = workflowMessageFor(prompt);
      const response = await stitchSenseAPI.sendChatMessage(
        activeSession.id,
        messageToSend,
        accessToken,
        {
          toolMode: toolModeForPrompt(prompt),
          patternId: uploadedContext?.patternId ?? null,
        },
      );
      setMessages((current) => [...current, response.message]);
      requestScrollToMessage(response.message.id);
      setStatusMessage('Conversation updated.');
    } catch (error) {
      const message = chatError(error);
      const errorMessageId = Date.now() + 1;
      setStatusMessage(message);
      setMessages((current) => [
        ...current,
        {
          id: errorMessageId,
          role: 'assistant',
          content: message,
          createdAt: new Date().toISOString(),
        },
      ]);
      requestScrollToMessage(errorMessageId);
    } finally {
      setDraft('');
      setIsSending(false);
    }
  }

  function sectionFollowupsFor(message: ChatMessage, index: number) {
    const suggestedSections = message.metadata?.suggestedSections;
    if (
      isSending ||
      message.role !== 'assistant' ||
      index !== messages.length - 1 ||
      !uploadedContext?.patternId ||
      !Array.isArray(suggestedSections)
    ) {
      return [];
    }

    return suggestedSections
      .filter((section): section is string => typeof section === 'string')
      .map((section) => section.replace(/\s+/g, ' ').trim())
      .filter((section) => section.length >= 3 && section.length <= 28)
      .slice(0, 4)
      .map((label) => ({ label }));
  }

	  function confirmFileLoaded(context: UploadedChatContext) {
	    const messageId = Date.now();
	    setUploadedContext(context);
	    setSession(null);
    setUploadOverlayPhase('done');
    setUploadOverlayMessage(`${context.name} has been ingested and is ready for chat.`);
    setMessages([
	      {
	        id: messageId,
	        role: 'assistant',
	        content: context.introMessage?.trim() || "File loaded, let's chat...",
	        createdAt: new Date().toISOString(),
	      },
    ]);
    requestScrollToMessage(messageId);
    setStatusMessage(`${context.name} is ready as chat context.`);
    setTimeout(() => setUploadOverlayVisible(false), 650);
  }

  async function pickImageContext() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setUploadOverlayVisible(false);
      Alert.alert('Permission required', 'Photo access is needed to load an image into chat.');
      return;
    }

    setIsLoadingFile(true);
    try {
      setUploadOverlayPhase('selecting');
      setUploadOverlayMessage('Choose a photo or image to analyse for this chat.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.82,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setUploadOverlayVisible(false);
        return;
      }

      const asset = result.assets[0];
      let analysis: string | null = null;
      let imageDataUri: string | null = null;
      if (accessToken) {
	        setUploadOverlayPhase('processing');
	        setUploadOverlayMessage('Analysing image so StitchSense can answer from it...');
        imageDataUri = await imageDataUriFor(asset.uri, asset.mimeType, asset.base64);
	        try {
	          const response = await stitchSenseAPI.analyseVision(accessToken, {
	            imageDataUri,
	            question: IMAGE_CONTEXT_PROMPT,
	            skillLevel,
	            toolMode: 'stitch_image_analysis',
	          });
          analysis = visionAnswerText(response.result);
	        } catch {
	          analysis = null;
	        }
	      }
	
	      confirmFileLoaded({
	        name: asset.fileName ?? 'Selected image',
	        kind: 'image',
	        mimeType: asset.mimeType ?? 'image/jpeg',
	        analysis,
        imageDataUri,
        introMessage: analysis
          ? `Image loaded. I can use this image as the only visual context for our chat.\n\n${analysis}`
          : 'Image loaded. I can use this image as the only visual context for our chat.',
	      });
    } catch (error) {
      setUploadOverlayPhase('error');
      setUploadOverlayMessage(chatError(error));
    } finally {
      setIsLoadingFile(false);
    }
  }

  async function pickDocumentContext() {
    setIsLoadingFile(true);
    try {
      setUploadOverlayPhase('selecting');
      setUploadOverlayMessage('Choose a pattern, PDF, document, or image to use in this chat.');
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: [
          'application/pdf',
          'text/plain',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'image/*',
        ],
      });

      if (result.canceled || !result.assets?.[0]) {
        setUploadOverlayVisible(false);
        return;
      }

      const asset = result.assets[0];
	      if (!accessToken) {
	        confirmFileLoaded({
	          name: asset.name,
	          kind: asset.mimeType?.startsWith('image/') ? 'image' : 'document',
	          mimeType: asset.mimeType,
          analysis: null,
        });
	        return;
	      }
	
      if (asset.mimeType?.startsWith('image/')) {
        setUploadOverlayPhase('processing');
        setUploadOverlayMessage('Analysing image so StitchSense can answer from it...');
        const imageDataUri = await imageDataUriFor(asset.uri, asset.mimeType);
        let analysis: string | null = null;
        try {
          const response = await stitchSenseAPI.analyseVision(accessToken, {
            imageDataUri,
            question: IMAGE_CONTEXT_PROMPT,
            skillLevel,
            toolMode: 'stitch_image_analysis',
          });
          analysis = visionAnswerText(response.result);
        } catch {
          analysis = null;
        }
        confirmFileLoaded({
          name: asset.name,
          kind: 'image',
          mimeType: asset.mimeType,
          analysis,
          imageDataUri,
          introMessage: analysis
            ? `Image loaded. I can use this image as the only visual context for our chat.\n\n${analysis}`
            : 'Image loaded. I can use this image as the only visual context for our chat.',
        });
        return;
      }

	      if (!asset.mimeType?.startsWith('image/')) {
        const documentContext = await uploadChatDocumentContext(
          {
            accessToken,
            asset: {
              uri: asset.uri,
              name: asset.name,
              mimeType: asset.mimeType,
            },
            skillLevel,
          },
          {
            api: stitchSenseAPI,
            onOverlayPhase: setUploadOverlayPhase,
            onOverlayMessage: setUploadOverlayMessage,
            onStatus: setStatusMessage,
          },
        );
        confirmFileLoaded(documentContext);
        return;
      }

      confirmFileLoaded({
        name: asset.name,
        kind: asset.mimeType?.startsWith('image/') ? 'image' : 'document',
        mimeType: asset.mimeType,
        analysis: null,
      });
    } catch (error) {
      setUploadOverlayPhase('error');
      setUploadOverlayMessage(chatError(error));
    } finally {
      setIsLoadingFile(false);
    }
  }

  function chooseUploadContext() {
    setUploadOverlayPhase('choose');
    setUploadOverlayMessage('Choose a pattern, document, or image to use as the only context for this chat.');
    setUploadOverlayVisible(true);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={92}
      style={styles.screen}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} style={styles.scroll}>
        <ScreenHero
          copy={heroCopy}
          eyebrow="AI Chat"
          icon="message-text-outline"
          title={heroTitle}
        />

        {messages.length > 0 ? (
          <View style={styles.messageList}>
            {messages.map((message, index) => (
              <View
                key={`${message.id}-${message.createdAt ?? ''}`}
                onLayout={(event) => {
                  messageLayouts.current[message.id] = event.nativeEvent.layout.y;
                  if (pendingScrollMessageId.current === message.id) {
                    scrollToMessage(message.id);
                  }
                }}
                style={[
                  styles.bubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}>
                {message.role === 'user' ? (
                  <Text style={[styles.bubbleText, styles.userBubbleText]}>{message.content}</Text>
                ) : (
                  <>
                    <RichMarkdownText text={message.content} />
                    {sectionFollowupsFor(message, index).length > 0 ? (
                      <View style={styles.followupActions}>
                        <Text style={styles.followupTitle}>Work another section</Text>
                        <View style={styles.followupGrid}>
                          {sectionFollowupsFor(message, index).map((section) => (
                            <Pressable
                              accessibilityRole="button"
                              key={section.label}
                              onPress={() =>
                                void handleSend(
                                  `Please give me the full step-by-step guide for the ${section.label} section of this pattern.`,
                                )
                              }
                              style={({ pressed }) => [
                                styles.followupButton,
                                pressed ? styles.followupButtonPressed : null,
                              ]}>
                              <Text style={styles.followupButtonText}>{section.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            ))}
            {isSending ? (
              <View style={[styles.bubble, styles.assistantBubble, styles.pendingBubble]}>
                <ActivityIndicator color={tokens.color.primary} size="small" />
                <Text style={styles.pendingText}>Writing a reply...</Text>
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

	      <View style={styles.composer}>
        <TextInput
          multiline
          onChangeText={setDraft}
          placeholder={isToolChat ? 'Ask me a question?' : 'Ask about knitting, crochet, yarn, or what to make...'}
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={draft}
        />
        <View style={styles.composerActions}>
          <BrandButton
            disabled={!draft.trim() || isSending}
            label={isSending ? 'Sending...' : 'Send'}
            loading={isSending}
            onPress={() => void handleSend()}
            style={styles.sendButton}
          />
          <Pressable
            accessibilityLabel="Upload chat context"
            accessibilityRole="button"
            disabled={isLoadingFile}
            onPress={chooseUploadContext}
            style={({ pressed }) => [
              styles.uploadButton,
              pressed ? styles.uploadButtonPressed : null,
              isLoadingFile ? styles.uploadButtonDisabled : null,
            ]}>
            {isLoadingFile ? (
              <ActivityIndicator color={tokens.color.primary} size="small" />
            ) : (
              <MaterialCommunityIcons color="#fffdf8" name="cloud-upload-outline" size={26} />
            )}
	          </Pressable>
	        </View>
	      </View>
	      <Modal
	        animationType="fade"
	        onRequestClose={() => {
	          if (!isLoadingFile) setUploadOverlayVisible(false);
	        }}
	        transparent
	        visible={uploadOverlayVisible}>
	        <View style={styles.uploadModalBackdrop}>
	          <View style={styles.uploadModalCard}>
	            <View style={styles.uploadModalHeader}>
	              <View style={styles.uploadModalIcon}>
	                {uploadOverlayPhase === 'choose' || uploadOverlayPhase === 'error' ? (
	                  <MaterialCommunityIcons color="#fffdf8" name="cloud-upload-outline" size={25} />
	                ) : (
	                  <ActivityIndicator color="#fffdf8" size="small" />
	                )}
	              </View>
	              <View style={styles.uploadModalCopy}>
	                <Text style={styles.uploadModalEyebrow}>Chat context</Text>
	                <Text style={styles.uploadModalTitle}>
	                  {uploadOverlayPhase === 'choose'
	                    ? 'Upload for this chat'
	                    : uploadOverlayPhase === 'error'
	                      ? 'Upload needs attention'
	                      : 'Processing upload'}
	                </Text>
	              </View>
	            </View>
	            <Text style={styles.uploadModalText}>{uploadOverlayMessage}</Text>
	            {uploadOverlayPhase === 'choose' || uploadOverlayPhase === 'error' ? (
	              <View style={styles.uploadChoiceStack}>
	                <BrandButton
	                  label="Pattern or document"
	                  onPress={() => void pickDocumentContext()}
	                  style={styles.fullWidth}
	                />
	                <BrandButton
	                  label="Photo or image"
	                  onPress={() => void pickImageContext()}
	                  style={styles.fullWidth}
	                  variant="secondary"
	                />
	                <BrandButton
	                  label="Close"
	                  onPress={() => setUploadOverlayVisible(false)}
	                  style={styles.fullWidth}
	                  variant="ghost"
	                />
	              </View>
	            ) : (
	              <View style={styles.processingPanel}>
	                <View style={styles.processingTrack}>
	                  <View style={styles.processingFill} />
	                </View>
	                <Text style={styles.processingHint}>
	                  Keep StitchSense open while the pattern is ingested.
	                </Text>
	              </View>
	            )}
	          </View>
	        </View>
	      </Modal>
	    </KeyboardAvoidingView>
	  );
	}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: tokens.color.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: 0,
    gap: tokens.spacing.xl2,
    paddingBottom: 176,
  },
  heroCard: {
    overflow: 'hidden',
    borderColor: 'rgba(20, 63, 54, 0.11)',
    borderRadius: 26,
    backgroundColor: 'rgba(255, 253, 250, 0.7)',
    paddingTop: tokens.spacing.xl2,
    paddingBottom: tokens.spacing.xl2,
    paddingHorizontal: tokens.spacing.xl,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacing.md,
  },
  heroTitleBlock: {
    flex: 1,
    gap: tokens.spacing.sm,
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 253, 250, 0.72)',
    flexShrink: 0,
  },
  eyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
  },
  copy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  contextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  contextPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  contextPillText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  setupCard: {
    gap: tokens.spacing.md,
  },
  contextLaunchCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#fffaf4',
    borderColor: '#dbc3ac',
  },
  contextLaunchList: {
    gap: tokens.spacing.sm,
  },
  contextLaunchRow: {
    minHeight: 66,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  contextLaunchText: {
    flex: 1,
    gap: 3,
  },
  contextLaunchTitle: {
    color: tokens.color.accent,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  contextLaunchCopy: {
    color: tokens.color.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
  },
  contextLaunchAction: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
  },
  contextLaunchActionText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  fastHelpCard: {
    gap: tokens.spacing.md,
    backgroundColor: '#f4fbfb',
    borderColor: '#c5e1df',
  },
  fastHelpList: {
    gap: tokens.spacing.sm,
  },
  fastHelpRow: {
    minHeight: 68,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  fastHelpCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  fastHelpTitle: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '900',
  },
  fastHelpText: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
  },
  fastHelpAction: {
    minHeight: 36,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fastHelpPrimaryAction: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primary,
  },
  fastHelpActionText: {
    color: tokens.color.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  fastHelpPrimaryActionText: {
    color: '#fff',
  },
  setupTitle: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  skillPill: {
    minHeight: 42,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skillPillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  skillPillText: {
    color: tokens.color.text,
    fontSize: 13,
    fontWeight: '800',
  },
  skillPillTextActive: {
    color: '#fff',
  },
  starterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  starterChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surfaceWarm,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  starterChipText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  preparedCard: {
    gap: tokens.spacing.md,
    borderColor: '#d5bea8',
    backgroundColor: '#fffaf4',
  },
  preparedEyebrow: {
    color: tokens.color.accent,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  preparedText: {
    color: tokens.color.text,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  preparedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  preparedButton: {
    flexGrow: 1,
    minWidth: 136,
  },
  fullWidth: {
    width: '100%',
  },
  emptyCard: {
    gap: tokens.spacing.xs,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  messageList: {
    gap: tokens.spacing.md,
  },
  bubble: {
    borderRadius: tokens.radius.large,
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: tokens.spacing.md,
    maxWidth: '92%',
    ...shadows.card,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.color.primary,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  bubbleText: {
    color: tokens.color.text,
    fontSize: 15,
    lineHeight: 22,
  },
  userBubbleText: {
    color: '#fff',
  },
  followupActions: {
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.lg,
  },
  followupTitle: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 13,
    fontWeight: '800',
  },
  followupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  followupButton: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.primary,
    backgroundColor: '#fffaf4',
    paddingHorizontal: tokens.spacing.lg,
    paddingVertical: 10,
  },
  followupButtonPressed: {
    opacity: 0.84,
    transform: [{ translateY: 1 }],
  },
  followupButtonText: {
    color: tokens.color.primary,
    fontFamily: tokens.font.body,
    fontSize: 14,
    fontWeight: '900',
  },
  pendingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  pendingText: {
    color: tokens.color.muted,
    fontSize: 14,
  },
  composer: {
    backgroundColor: tokens.color.surface,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    paddingHorizontal: tokens.spacing.lg,
    paddingTop: tokens.spacing.lg,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.md,
  },
  statusText: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 78,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.md,
    color: tokens.color.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  sendButton: {
    width: '70%',
  },
  uploadButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.accent,
    backgroundColor: tokens.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonPressed: {
    opacity: 0.92,
    transform: [{ translateY: 1 }],
  },
  uploadButtonDisabled: {
    opacity: 0.55,
  },
  uploadModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 63, 54, 0.32)',
    justifyContent: 'center',
    padding: tokens.spacing.lg,
  },
  uploadModalCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: tokens.color.surface,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.lg,
    ...shadows.card,
  },
  uploadModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  uploadModalIcon: {
    width: 54,
    height: 54,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadModalCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  uploadModalEyebrow: {
    color: tokens.color.accent,
    fontFamily: tokens.font.body,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  uploadModalTitle: {
    color: tokens.color.primary,
    fontFamily: tokens.font.display,
    fontSize: 25,
    lineHeight: 30,
  },
  uploadModalText: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
  },
  uploadChoiceStack: {
    gap: tokens.spacing.sm,
  },
  processingPanel: {
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: 'rgba(20, 63, 54, 0.11)',
    backgroundColor: '#fffaf4',
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  processingTrack: {
    height: 10,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#ead9cb',
    overflow: 'hidden',
  },
  processingFill: {
    width: '64%',
    height: '100%',
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.primary,
  },
  processingHint: {
    color: tokens.color.muted,
    fontFamily: tokens.font.body,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
});
