import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { APIError, stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { ChatMessage, ChatSession } from '@/src/lib/models';
import { useLibrary } from '@/src/providers/library-provider';
import { usePreferences } from '@/src/providers/preferences-provider';
import { useSession } from '@/src/providers/session-provider';
import { RichMarkdownText } from '@/src/components/ui/rich-markdown-text';
import { richTextToPlainText } from '@/src/lib/rich-text';
import { BrandButton } from '@/src/components/ui/brand-button';
import { shadows, tokens } from '@/src/theme/tokens';

const responseStages = [
  'Reading the pattern context…',
  'Checking the relevant rows and notes…',
  'Drafting a clear reply…',
  'Saving the answer to this chat…',
] as const;

type ChatSkillLevel = 'beginner' | 'confident' | 'expert';
const OWNED_SOURCE_REQUIRED_MESSAGE =
  'Please purchase the pattern and re-import it before I can answer questions or rewrite it.';

function preferredChatLevel(defaultSkill: string): ChatSkillLevel {
  if (defaultSkill === 'advanced') {
    return 'expert';
  }
  if (defaultSkill === 'intermediate') {
    return 'confident';
  }
  return 'beginner';
}

function buildSessionTitleFromPrompt(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Pattern conversation';
  }
  return normalized.length > 42
    ? `${normalized.slice(0, 42).trimEnd()}…`
    : normalized;
}

function userFacingChatError(error: unknown) {
  if (error instanceof APIError) {
    if (error.message.includes('Workflow chat failed with 401')) {
      return 'The StitchSense chat workflow rejected this request. The N8N shared secret likely needs checking.';
    }
    if (error.message.includes('Workflow chat failed with 404')) {
      return 'The StitchSense chat workflow is not reachable yet.';
    }
    return error.message;
  }

  if (error instanceof Error) {
    return getUserFacingErrorMessage(error, {
      fallback: 'Sorry, StitchSense could not complete that chat request right now.',
    });
  }

  return 'Sorry, StitchSense could not complete that chat request right now.';
}

export default function PatternChatScreen() {
  const { patternId, sessionId, starter, summary, placeholder } = useLocalSearchParams<{
    patternId: string;
    sessionId?: string;
    starter?: string;
    summary?: string;
    placeholder?: string;
  }>();
  const { patterns } = useLibrary();
  const { settings } = usePreferences();
  const { accessToken } = useSession();
  const pattern = useMemo(
    () => patterns.find((item) => item.id === patternId),
    [patternId, patterns],
  );

  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Loading your pattern chat…');
  const [selectedSkillLevel, setSelectedSkillLevel] =
    useState<ChatSkillLevel>(preferredChatLevel(settings.defaultSkill));
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [responseStageIndex, setResponseStageIndex] = useState(0);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [responseToReveal, setResponseToReveal] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const scrollRef = useRef<ScrollView>(null);
  const messageListOffsetRef = useRef(0);
  const ravelryUrl = String(
    pattern?.metadata?.ravelry_url ??
      pattern?.metadata?.source_url ??
      pattern?.sourceUrl ??
      '',
  ).trim();

  useEffect(() => {
    setMessages([]);
    setSession(null);
    setDraft(typeof starter === 'string' ? starter : '');
    setInlineError(null);
    setLastFailedPrompt(null);
    setStatusMessage('Loading your pattern chat…');

    async function load() {
      const requestId = ++loadRequestRef.current;
      if (!accessToken || !patternId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setStatusMessage('Loading your pattern chat…');

      try {
        const sessionsResponse = await stitchSenseAPI.patternChats(patternId, accessToken);
        if (loadRequestRef.current !== requestId) {
          return;
        }
        const latestSession =
          sessionsResponse.sessions.find(
            (item) => item.id === sessionId && item.patternId === patternId,
          ) ??
          sessionsResponse.sessions.find((item) => item.patternId === patternId) ??
          null;
        setSession(latestSession);

        if (!latestSession) {
          setMessages([]);
          setDraft(typeof starter === 'string' ? starter : '');
          setStatusMessage('No previous chat yet.');
          return;
        }

        const messagesResponse = await stitchSenseAPI.chatMessages(latestSession.id, accessToken);
        if (loadRequestRef.current !== requestId) {
          return;
        }
        setMessages(messagesResponse.messages);
        setSelectedSkillLevel(
          (latestSession.skillLevel as ChatSkillLevel | null | undefined) ??
            preferredChatLevel(settings.defaultSkill),
        );
        setStatusMessage(
          messagesResponse.messages.length > 0
            ? 'Loaded your latest conversation.'
            : 'No previous chat yet.',
        );
      } catch (error) {
        if (loadRequestRef.current !== requestId) {
          return;
        }
        setStatusMessage(userFacingChatError(error));
      } finally {
        if (loadRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    }

    void load();
  }, [accessToken, patternId, sessionId, settings.defaultSkill, starter]);

  useEffect(() => {
    if (!isSending) {
      setResponseStageIndex(0);
      return undefined;
    }

    const timer = setInterval(() => {
      setResponseStageIndex((current) => Math.min(current + 1, responseStages.length - 1));
    }, 1800);

    return () => clearInterval(timer);
  }, [isSending]);

  const summaryContext =
    typeof summary === 'string' && summary.trim()
      ? summary.trim()
      : pattern?.patternSummaryText?.trim() ?? '';
  const inputPlaceholder =
    typeof placeholder === 'string' && placeholder.trim()
      ? placeholder.trim()
      : 'Ask about this pattern';

  const sourceRequired = inlineError?.includes(OWNED_SOURCE_REQUIRED_MESSAGE) ?? false;

  async function handleOpenRavelry() {
    if (!ravelryUrl) {
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(ravelryUrl);
    } catch {
      await Linking.openURL(ravelryUrl);
    }
  }

  async function handleSend(rawMessage?: string, options?: { keepDraft?: boolean; optimistic?: boolean }) {
    const trimmed = (rawMessage ?? draft).trim();
    if (!trimmed || !accessToken || !pattern) {
      return;
    }

    if (!options?.keepDraft) {
      setDraft('');
    }
    setIsSending(true);
    setInlineError(null);
    setLastFailedPrompt(null);
    setResponseStageIndex(0);
    setStatusMessage('StitchSense is thinking…');

    const optimisticMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    if (options?.optimistic !== false) {
      setMessages((current) => [...current, optimisticMessage]);
    }

    try {
      let activeSession = session;
      if (!activeSession) {
        const createResponse = await stitchSenseAPI.createChat(
          pattern.id,
          buildSessionTitleFromPrompt(trimmed),
          accessToken,
          selectedSkillLevel,
        );
        activeSession = createResponse.session;
        setSession(createResponse.session);
      }

      const response = await stitchSenseAPI.sendChatMessage(
        activeSession.id,
        trimmed,
        accessToken,
        { patternId: pattern.id },
      );
      setResponseToReveal(String(response.message.id));
      setMessages((current) => [...current, response.message]);
      setStatusMessage('Chat updated.');
    } catch (error) {
      const message = userFacingChatError(error);
      setInlineError(message);
      setLastFailedPrompt(trimmed);
      setStatusMessage(message);
    } finally {
      setIsSending(false);
    }
  }

  async function handleCopyResponse(message: ChatMessage) {
    await Clipboard.setStringAsync(richTextToPlainText(message.content));
    const messageId = String(message.id);
    setCopiedMessageId(messageId);
    setTimeout(() => {
      setCopiedMessageId((current) => (current === messageId ? null : current));
    }, 1600);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={96}
      style={styles.screen}>
      {isLoading && messages.length === 0 ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={tokens.color.primary} />
          <Text style={styles.loadingText}>{statusMessage}</Text>
        </View>
      ) : (
        <>
          <ScrollView ref={scrollRef} contentContainerStyle={styles.content} style={styles.scroll}>
            <View style={styles.headerCard}>
              <Text style={styles.eyebrow}>Pattern chat</Text>
              <Text style={styles.title}>{pattern?.title ?? 'Pattern'}</Text>
              {summaryContext ? <Text style={styles.summaryContext}>{summaryContext}</Text> : null}
            </View>

            {inlineError ? (
              <View style={[styles.errorCard, sourceRequired ? styles.purchaseWarningCard : null]}>
                <Text style={[styles.errorTitle, sourceRequired ? styles.purchaseWarningTitle : null]}>
                  {sourceRequired ? 'Pattern purchase required' : 'Couldn’t send that just now'}
                </Text>
                <Text style={[styles.errorCopy, sourceRequired ? styles.purchaseWarningCopy : null]}>
                  {inlineError}
                </Text>
                {sourceRequired && ravelryUrl ? (
                  <BrandButton
                    label="View pattern on Ravelry"
                    onPress={() => void handleOpenRavelry()}
                    style={styles.retryButton}
                  />
                ) : null}
                {!sourceRequired && lastFailedPrompt ? (
                  <BrandButton
                    label="Retry last question"
                    onPress={() =>
                      void handleSend(lastFailedPrompt, {
                        keepDraft: true,
                        optimistic: false,
                      })
                    }
                    style={styles.retryButton}
                  />
                ) : null}
              </View>
            ) : null}

            {messages.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Start the conversation</Text>
                <Text style={styles.emptyCopy}>
                  Ask for help with tricky pattern wording or what to do next.
                </Text>
              </View>
            ) : (
              <View
                onLayout={(event) => {
                  messageListOffsetRef.current = event.nativeEvent.layout.y;
                }}
                style={styles.messageList}>
                {messages.map((message) => (
                  <View
                    key={`${message.id}-${message.createdAt ?? ''}`}
                    onLayout={(event) => {
                      if (message.role !== 'user' && responseToReveal === String(message.id)) {
                        scrollRef.current?.scrollTo({
                          y: Math.max(
                            0,
                            messageListOffsetRef.current + event.nativeEvent.layout.y - tokens.spacing.sm,
                          ),
                          animated: true,
                        });
                        setResponseToReveal(null);
                      }
                    }}
                    style={[
                      styles.bubble,
                      message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                    ]}>
                    {message.role === 'user' ? (
                      <Text style={[styles.bubbleText, styles.userBubbleText]}>
                        {message.content}
                      </Text>
                    ) : (
                      <>
                        <Pressable
                          accessibilityLabel={
                            copiedMessageId === String(message.id)
                              ? 'Response copied'
                              : 'Copy StitchSense response'
                          }
                          accessibilityRole="button"
                          hitSlop={8}
                          onPress={() => void handleCopyResponse(message)}
                          style={({ pressed }) => [
                            styles.copyButton,
                            pressed ? styles.copyButtonPressed : null,
                          ]}>
                          <MaterialCommunityIcons
                            color={
                              copiedMessageId === String(message.id)
                                ? tokens.color.primary
                                : tokens.color.muted
                            }
                            name={
                              copiedMessageId === String(message.id)
                                ? 'check'
                                : 'content-copy'
                            }
                            size={18}
                          />
                        </Pressable>
                        <View style={styles.assistantResponseContent}>
                          <RichMarkdownText text={message.content} />
                        </View>
                      </>
                    )}
                  </View>
                ))}
                {isSending ? (
                  <View
                    onLayout={(event) => {
                      scrollRef.current?.scrollTo({
                        y: Math.max(
                          0,
                          messageListOffsetRef.current + event.nativeEvent.layout.y - tokens.spacing.sm,
                        ),
                        animated: true,
                      });
                    }}
                    style={[styles.bubble, styles.assistantBubble, styles.pendingBubble]}>
                    <View style={styles.pendingHeader}>
                      <ActivityIndicator color={tokens.color.primary} size="small" />
                      <Text style={styles.pendingText}>{responseStages[responseStageIndex]}</Text>
                    </View>
                    <View style={styles.stageTrack}>
                      {responseStages.map((stage, index) => (
                        <View
                          key={stage}
                          style={[
                            styles.stageDot,
                            index <= responseStageIndex ? styles.stageDotActive : null,
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={styles.pendingMeta}>
                      The reply will appear here and save back to your shared StitchSense chat.
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              multiline
              onChangeText={setDraft}
              placeholder={inputPlaceholder}
              placeholderTextColor="#9b867d"
              style={styles.input}
              value={draft}
            />
            <Pressable
              disabled={isSending || !draft.trim()}
              onPress={() => void handleSend()}
              style={[
                styles.sendButton,
                isSending || !draft.trim() ? styles.sendButtonDisabled : null,
              ]}>
              <Text style={styles.sendLabel}>{isSending ? '…' : 'Go'}</Text>
            </Pressable>
          </View>
        </>
      )}
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
    padding: tokens.spacing.lg,
    gap: tokens.spacing.lg,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
    padding: tokens.spacing.xl,
  },
  loadingText: {
    color: tokens.color.muted,
    fontSize: 15,
    textAlign: 'center',
  },
  headerCard: {
    backgroundColor: tokens.color.surfaceWarm,
    borderRadius: tokens.radius.large,
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
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  summaryContext: {
    color: '#183b35',
    fontFamily: tokens.font.body,
    fontSize: 14,
    lineHeight: 20,
    marginTop: tokens.spacing.sm,
  },
  errorCard: {
    backgroundColor: '#fff5f2',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#efc6bb',
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  errorTitle: {
    color: tokens.color.text,
    fontSize: 19,
    fontWeight: '700',
  },
  errorCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  purchaseWarningCard: {
    backgroundColor: '#fff2f2',
    borderColor: '#d35d5d',
  },
  purchaseWarningTitle: {
    color: '#a12727',
    fontWeight: '800',
  },
  purchaseWarningCopy: {
    color: '#a12727',
    fontWeight: '700',
  },
  retryButton: {
    width: '100%',
    marginTop: tokens.spacing.xs,
  },
  emptyCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: 22,
    fontWeight: '700',
  },
  emptyCopy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
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
    position: 'relative',
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  assistantResponseContent: {
    paddingRight: tokens.spacing.xl,
  },
  copyButton: {
    position: 'absolute',
    right: tokens.spacing.sm,
    top: tokens.spacing.sm,
    zIndex: 1,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  copyButtonPressed: {
    opacity: 0.65,
  },
  pendingBubble: {
    gap: tokens.spacing.sm,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  stageTrack: {
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 30,
  },
  stageDot: {
    width: 24,
    height: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: '#eadbd0',
  },
  stageDotActive: {
    backgroundColor: tokens.color.primary,
  },
  bubbleText: {
    color: tokens.color.text,
    fontSize: 16,
    lineHeight: 24,
  },
  userBubbleText: {
    color: '#fff',
  },
  pendingText: {
    color: tokens.color.text,
    fontSize: 14,
    fontWeight: '700',
  },
  pendingMeta: {
    color: tokens.color.muted,
    fontSize: 12,
    lineHeight: 18,
    paddingLeft: 30,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  input: {
    flex: 1,
    minHeight: 52,
    maxHeight: 140,
    borderRadius: tokens.radius.medium,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.background,
    color: tokens.color.text,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: tokens.spacing.sm,
    fontSize: 16,
  },
  sendButton: {
    minWidth: 60,
    minHeight: 52,
    borderRadius: tokens.radius.medium,
    backgroundColor: tokens.color.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
  sendLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});
