import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
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

import { BrandButton } from '@/src/components/ui/brand-button';
import { InlineBackButton } from '@/src/components/ui/inline-back-button';
import { RichMarkdownText } from '@/src/components/ui/rich-markdown-text';
import { APIError, stitchSenseAPI } from '@/src/lib/api';
import { getUserFacingErrorMessage } from '@/src/lib/errors';
import type { ChatMessage, ChatSession } from '@/src/lib/models';
import { useSession } from '@/src/providers/session-provider';
import { shadows, tokens } from '@/src/theme/tokens';

const fallbackPrompts = [
  'Explain this in plain English.',
  'What should I check next?',
  'Can you give me a safer option?',
  'Please turn this into a quick checklist.',
] as const;

const skillLevels = ['beginner', 'confident', 'expert'] as const;

function userFacingChatError(error: unknown) {
  if (error instanceof APIError) {
    if (error.message.includes('Workflow chat failed with 401')) {
      return 'The StitchSense helper workflow rejected this request. The N8N shared secret likely needs checking.';
    }
    if (error.message.includes('Workflow chat failed with 404')) {
      return 'The StitchSense helper workflow is not reachable yet.';
    }
    return error.message;
  }

  if (error instanceof Error) {
    return getUserFacingErrorMessage(error, {
      fallback: 'Sorry, StitchSense could not complete that request right now.',
    });
  }

  return 'Sorry, StitchSense could not complete that request right now.';
}

export default function HelperChatScreen() {
  const router = useRouter();
  const {
    starter,
    title,
    context,
    toolMode,
    skillLevel,
  } = useLocalSearchParams<{
    starter?: string;
    title?: string;
    context?: string;
    toolMode?: string;
    skillLevel?: string;
  }>();
  const { accessToken } = useSession();

  const [draft, setDraft] = useState(starter ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(
    'Use this helper space for tool follow-ups, terminology questions, and quick decisions.',
  );
  const [selectedSkillLevel, setSelectedSkillLevel] = useState<
    (typeof skillLevels)[number]
  >(
    skillLevel === 'confident' || skillLevel === 'expert' ? skillLevel : 'beginner',
  );
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const helperTitle = title?.trim() ? title.trim() : 'Ask StitchSense';
  const helperToolMode = toolMode?.trim() ? toolMode.trim() : 'general_helper';
  const helperContext = context?.trim() ? context.trim() : '';

  const promptChips = useMemo(() => {
    const seen = new Set<string>();
    const historyPrompts = messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content.trim())
      .filter((content) => {
        if (!content || seen.has(content)) {
          return false;
        }
        seen.add(content);
        return true;
      })
      .slice(-4)
      .reverse();

    return historyPrompts.length > 0 ? historyPrompts : [...fallbackPrompts];
  }, [messages]);

  const sessionTitle = useMemo(() => {
    if (session?.title && session.title !== 'Untitled chat') {
      return session.title;
    }

    const firstUserPrompt = messages.find((message) => message.role === 'user')?.content?.trim();
    if (firstUserPrompt) {
      return firstUserPrompt.length > 42
        ? `${firstUserPrompt.slice(0, 42).trim()}…`
        : firstUserPrompt;
    }

    return helperTitle;
  }, [helperTitle, messages, session?.title]);

  async function handleSend(rawMessage?: string, options?: { keepDraft?: boolean; optimistic?: boolean }) {
    const trimmed = (rawMessage ?? draft).trim();
    if (!trimmed || !accessToken) {
      return;
    }

    if (!options?.keepDraft) {
      setDraft('');
    }

    setIsSending(true);
    setInlineError(null);
    setLastFailedPrompt(null);
    setStatusMessage('StitchSense is thinking…');

    const messageToSend = helperContext
      ? `${trimmed}\n\nContext:\n${helperContext}`
      : trimmed;

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
        const created = await stitchSenseAPI.createChat(
          null,
          helperTitle,
          accessToken,
          selectedSkillLevel,
        );
        activeSession = created.session;
        setSession(created.session);
      }

      const response = await stitchSenseAPI.sendChatMessage(
        activeSession.id,
        messageToSend,
        accessToken,
        { toolMode: helperToolMode },
      );
      setMessages((current) => [...current, response.message]);
      setStatusMessage('Helper conversation updated.');
    } catch (error) {
      const message = userFacingChatError(error);
      setInlineError(message);
      setLastFailedPrompt(trimmed);
      setStatusMessage(message);
    } finally {
      setIsSending(false);
    }
  }

  function startFresh() {
    setMessages([]);
    setSession(null);
    setDraft(starter ?? '');
    setInlineError(null);
    setLastFailedPrompt(null);
    setStatusMessage('Fresh helper chat ready.');
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={96}
      style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} style={styles.scroll}>
        <InlineBackButton label="Close tool" onPress={() => router.replace('/(tabs)/tools')} />

        <View style={styles.headerCard}>
          <Text style={styles.eyebrow}>Helper chat</Text>
          <Text style={styles.title}>{helperTitle}</Text>
          <Text style={styles.copy}>
            Ask StitchSense for practical next steps, clearer wording, safer substitutions, or a second opinion before you carry on.
          </Text>
          <View style={styles.sessionMetaRow}>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>{sessionTitle}</Text>
            </View>
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {selectedSkillLevel.charAt(0).toUpperCase() + selectedSkillLevel.slice(1)}
              </Text>
            </View>
          </View>
          <View style={styles.headerActionRow}>
            <Pressable onPress={startFresh} style={styles.headerAction}>
              <Text style={styles.headerActionText}>New helper chat</Text>
            </Pressable>
            <Pressable onPress={() => router.replace('/(tabs)/tools')} style={styles.headerAction}>
              <Text style={styles.headerActionText}>All tools</Text>
            </Pressable>
          </View>
        </View>

        {helperContext ? (
          <View style={styles.contextCard}>
            <Text style={styles.contextTitle}>Current context</Text>
            <Text style={styles.contextCopy}>{helperContext}</Text>
          </View>
        ) : null}

        <View style={styles.controlsCard}>
          <Text style={styles.controlsTitle}>Conversation setup</Text>
          <Text style={styles.controlsCopy}>
            Pick the level that matches how much explanation you want back.
          </Text>
          <View style={styles.skillRow}>
            {skillLevels.map((level) => {
              const active = selectedSkillLevel === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => setSelectedSkillLevel(level)}
                  style={[styles.skillPill, active ? styles.skillPillActive : null]}>
                  <Text
                    style={[styles.skillPillText, active ? styles.skillPillTextActive : null]}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.promptChipRow}>
            {promptChips.map((promptText) => (
              <Pressable
                key={promptText}
                onPress={() => setDraft(promptText)}
                style={styles.promptChip}>
                <Text style={styles.promptChipText}>{promptText}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {inlineError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Couldn’t send that just now</Text>
            <Text style={styles.errorCopy}>{inlineError}</Text>
            {lastFailedPrompt ? (
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
              Ask about ease, yarn swaps, tool sizes, abbreviations, or what this result means for your project.
            </Text>
          </View>
        ) : (
          <View style={styles.messageList}>
            {messages.map((message) => (
              <View
                key={`${message.id}-${message.createdAt ?? ''}`}
                style={[
                  styles.bubble,
                  message.role === 'user' ? styles.userBubble : styles.assistantBubble,
                ]}>
                {message.role === 'user' ? (
                  <Text style={[styles.bubbleText, styles.userBubbleText]}>
                    {message.content}
                  </Text>
                ) : (
                  <RichMarkdownText text={message.content} />
                )}
              </View>
            ))}
            {isSending ? (
              <View style={[styles.bubble, styles.assistantBubble, styles.pendingBubble]}>
                <ActivityIndicator color={tokens.color.primary} size="small" />
                <Text style={styles.pendingText}>StitchSense is writing a reply…</Text>
              </View>
            ) : null}
          </View>
        )}

        {messages.length > 0 ? (
          <View style={styles.followThroughCard}>
            <Text style={styles.controlsTitle}>Turn this into action</Text>
            <Text style={styles.controlsCopy}>
              Jump to the app area that usually comes next after helper advice.
            </Text>
            <View style={styles.followThroughRow}>
              <Pressable onPress={() => router.push('/(tabs)/library')} style={styles.followThroughButton}>
                <Text style={styles.followThroughText}>Library</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(tabs)/stash')} style={styles.followThroughButton}>
                <Text style={styles.followThroughText}>Stash</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/(tabs)/workspace')} style={styles.followThroughButton}>
                <Text style={styles.followThroughText}>Projects</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/gauge-calculator')} style={styles.followThroughButton}>
                <Text style={styles.followThroughText}>Gauge</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.composer}>
        <Text style={styles.statusLine}>{statusMessage}</Text>
        <TextInput
          autoCapitalize="sentences"
          multiline
          onChangeText={setDraft}
          placeholder="Ask StitchSense anything about this helper..."
          placeholderTextColor="#9b867d"
          style={styles.input}
          value={draft}
        />
        <BrandButton
          label={isSending ? 'Sending…' : 'Send'}
          onPress={() => void handleSend()}
          disabled={!draft.trim() || isSending}
          loading={isSending}
          style={styles.sendButton}
        />
      </View>
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
    paddingBottom: 180,
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
  copy: {
    color: tokens.color.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  sessionMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  metaPill: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  metaPillText: {
    color: tokens.color.text,
    fontSize: 13,
    fontWeight: '600',
  },
  headerActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  headerAction: {
    flexGrow: 1,
    minHeight: 40,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  headerActionText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
  },
  contextCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.xs,
  },
  contextTitle: {
    color: tokens.color.text,
    fontSize: 16,
    fontWeight: '700',
  },
  contextCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  controlsCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
  },
  controlsTitle: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '700',
  },
  controlsCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  skillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  skillPill: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
    backgroundColor: tokens.color.surfaceWarm,
  },
  skillPillActive: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  skillPillText: {
    color: tokens.color.text,
    fontSize: 13,
    fontWeight: '600',
  },
  skillPillTextActive: {
    color: '#fff',
  },
  promptChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  promptChip: {
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    paddingHorizontal: tokens.spacing.md,
    paddingVertical: 10,
  },
  promptChipText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  errorCard: {
    backgroundColor: '#fff2ee',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#e1b5a8',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  errorTitle: {
    color: '#8f3f2b',
    fontSize: 16,
    fontWeight: '700',
  },
  errorCopy: {
    color: '#8f3f2b',
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    width: '100%',
    marginTop: tokens.spacing.xs,
  },
  emptyCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.color.border,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.xs,
  },
  emptyTitle: {
    color: tokens.color.text,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyCopy: {
    color: tokens.color.muted,
    fontSize: 14,
    lineHeight: 21,
  },
  followThroughCard: {
    backgroundColor: '#fffaf4',
    borderRadius: tokens.radius.large,
    borderWidth: 1,
    borderColor: '#dbc3ac',
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  followThroughRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.spacing.sm,
  },
  followThroughButton: {
    flexGrow: 1,
    minWidth: 102,
    minHeight: 42,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.spacing.md,
  },
  followThroughText: {
    color: tokens.color.primary,
    fontSize: 13,
    fontWeight: '900',
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
    paddingTop: tokens.spacing.md,
    paddingBottom: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  statusLine: {
    color: tokens.color.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 92,
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
  sendButton: {
    width: '100%',
  },
});
