import { useCallback, useEffect, useRef } from 'react';
import { readChatStream } from '../utils/stream';
import { useChatStore, genMsgId } from '../store/useChatStore';
import { useAppStore } from '../store/useAppStore';

/**
 * 聊天流式 Hook —— 把 ChatPage 的 SSE 逻辑全部抽出来。
 *
 * 职责：
 *   - 普通消息发送（含角色前缀解析、上下文快照、retry）
 *   - 角色扮演润色（前缀模式：AI 润色扩写后以角色身份发出）
 *   - 角色扮演 AI 代写（双击模式：完全由 AI 生成）
 *   - AbortController 管理（取消生成）
 *   - 等待分阶段提示（3s/10s）
 *   - SSE 事件分发到 store
 *
 * 不负责：
 *   - UI 渲染、滚动、草稿（这些在 ChatPage / 其他 hook）
 *   - 会话历史加载（useHistory）
 */
export function useChatStream() {
  const store = useChatStore();
  const abortRef = useRef(null);

  const {
    sessionId,
    messages,
    character,
    characterId,
    rolePrefix,
    customResponsePrompt,
    loading,
    streaming,
  } = useChatStore();

  const user = useAppStore((s) => s.user);

  // 角色名映射（与原 ChatPage 逻辑一致）
  const roleNames = {
    ai: character?.name || 'AI',
    user: user?.display_name || '我',
    narrator: '旁白',
  };

  // ── 等待分阶段：3s 升级"组织语言"，10s 升级"耐心等待" ──
  useEffect(() => {
    if (!loading || streaming) {
      store.setWaitStage(0);
      return;
    }
    store.setWaitStage(1);
    const t1 = setTimeout(() => store.setWaitStage(2), 3000);
    const t2 = setTimeout(() => store.setWaitStage(3), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, streaming]);

  // ── 取消生成 ──
  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── 解析角色前缀 ──
  const parseRolePrefix = useCallback(
    (rawInput, effRoleNames, effRolePrefix) => {
      const prefixMatch = rawInput.match(/^\/(.+?): (.+)/);
      const currentRolePrefix = prefixMatch
        ? prefixMatch[1] === effRoleNames.ai
          ? 'ai'
          : prefixMatch[1] === effRoleNames.user
            ? 'user'
            : 'narrator'
        : effRolePrefix;
      const cleanText = prefixMatch ? prefixMatch[2] : rawInput;
      return { currentRolePrefix, cleanText, hasPrefix: !!prefixMatch };
    },
    []
  );

  // ── 核心发送 ──
  // q 必须传：调用方（ChatPage/quickSend/retry/edit）负责传入要发送的文本
  const sendMessage = useCallback(
    async (q, ctxOverride, options = {}) => {
      const currentInput = (q || '').trim();
      if (!currentInput || useChatStore.getState().loading) return;

      const { retry = false } = options || {};

      // ctxOverride 用于重试时还原原消息的上下文快照
      const currentState = useChatStore.getState();
      const effCharacterId = ctxOverride?.characterId ?? currentState.characterId;
      const effCharacter = ctxOverride?.character ?? currentState.character;
      const effResponsePrompt = ctxOverride?.response_prompt ?? currentState.customResponsePrompt;
      const effRolePrefix = ctxOverride?.rolePrefix ?? currentState.rolePrefix;
      const effRoleNames = ctxOverride?.roleNames ?? roleNames;

      const { currentRolePrefix, cleanText, hasPrefix } = parseRolePrefix(
        currentInput,
        effRoleNames,
        effRolePrefix
      );

      const controller = new AbortController();
      abortRef.current = controller;

      // ── 角色扮演模式：AI 润色扩写后以角色身份发出 ──
      if (currentRolePrefix && hasPrefix) {
        const roleLabel =
          currentRolePrefix === 'ai'
            ? effRoleNames.ai
            : currentRolePrefix === 'user'
              ? effRoleNames.user
              : '旁白';

        useChatStore.getState().setLoading(true);
        useChatStore.getState().setRolePrefix('');

        const ctx = useChatStore
          .getState()
          .messages.slice(-6)
          .map((m) => `${m.role}: ${m.content}`)
          .join('\n');

        const polishPrompt = `你是${roleLabel}。用户想让你说这段话（可能需要润色或扩写）："${cleanText}"

请将这段话自然地润色、扩写，使其更符合${roleLabel}的角色设定和当前对话语境。要求：
1. 保持原意，但让表达更生动自然
2. 适当扩写，不要太简短
3. 完全以${roleLabel}的口吻和身份来说
4. 只输出最终内容，不要加任何前缀、说明或引号

${ctx ? `\n对话上下文：\n${ctx}` : ''}`;

        const msgRole = currentRolePrefix === 'user' ? 'user' : 'assistant';
        const msgId = genMsgId();
        useChatStore.getState().appendMessage({
          id: msgId,
          role: msgRole,
          content: '',
          asRole: roleLabel,
          streaming: true,
        });

        try {
          await readChatStream(
            polishPrompt,
            useChatStore.getState().sessionId,
            {
              characterId: effCharacterId,
              parameters: effCharacter?.parameters || {},
              response_prompt: effResponsePrompt,
              signal: abortRef.current?.signal,
            },
            {
              onChunk: (_chunk, fullText) => {
                useChatStore.getState().setStreaming(fullText);
                useChatStore.getState().updateMessage(msgId, { content: fullText });
              },
              onDone: (event) =>
                useChatStore
                  .getState()
                  .updateMessage(msgId, { id: event.message_id || msgId, streaming: false }),
              onError: (msg) =>
                useChatStore.getState().updateMessage(msgId, {
                  content: `❌ ${msg}`,
                  streaming: false,
                }),
            }
          );
        } catch (err) {
          if (err.name !== 'AbortError') {
            useChatStore.getState().appendMessage({
              id: genMsgId(),
              role: 'assistant',
              content: '润色失败，请重试',
            });
          }
        } finally {
          useChatStore.getState().setLoading(false);
          useChatStore.getState().setStreaming('');
          abortRef.current = null;
        }
        return;
      }

      // ── 保存发送时的上下文快照到用户消息（用于重试还原）──
      const msgContext = {
        characterId: effCharacterId,
        character: effCharacter,
        response_prompt: effResponsePrompt,
        rolePrefix: currentRolePrefix,
        roleNames: effRoleNames,
      };

      // ── 普通消息 ──
      // retry 模式不重复插入 user 消息（handleRetry 已保留原 user 消息）
      if (!retry) {
        useChatStore.getState().appendMessage({
          id: genMsgId(),
          role: 'user',
          content: currentInput,
          _context: msgContext,
        });
      }
      useChatStore.getState().setLoading(true);
      if (!q) useChatStore.getState().setRolePrefix('');

      const aiMsgId = genMsgId();
      useChatStore.getState().appendMessage({
        id: aiMsgId,
        role: 'assistant',
        content: '',
        streaming: true,
      });

      try {
        await readChatStream(
          currentInput,
          useChatStore.getState().sessionId,
          {
            characterId: effCharacterId,
            parameters: effCharacter?.parameters || {},
            response_prompt: effResponsePrompt,
            signal: abortRef.current?.signal,
          },
          {
            onChunk: (_chunk, fullText) => {
              useChatStore.getState().setStreaming(fullText);
              useChatStore.getState().updateMessage(aiMsgId, { content: fullText });
            },
            onTiming: (event) => {
              const timing = {
                ttft_ms: event.ttft_ms,
                total_ms: event.total_ms,
                cached: event.cached,
              };
              useChatStore.getState().setLastTiming(timing);
              useChatStore.getState().updateMessage(aiMsgId, { timing });
            },
            onUsage: (event) => {
              useChatStore.getState().updateMessage(aiMsgId, { tokenCount: event.answer_tokens });
              if (event.session_total != null)
                useChatStore.getState().setSessionTokens(event.session_total);
            },
            onDone: (event) => {
              const st = useChatStore.getState();
              if (!st.sessionId) st.setSessionId(event.session_id);
              st.updateMessage(aiMsgId, {
                id: event.message_id || aiMsgId,
                streaming: false,
                sources: event.sources || [],
              });
            },
            onError: (msg) => {
              const st = useChatStore.getState();
              st.updateMessage(aiMsgId, { content: `❌ ${msg}`, streaming: false });
            },
          }
        );
        useChatStore.getState().setStreaming('');
      } catch (err) {
        if (err.name === 'AbortError') return;
        const msg = err?.message || 'AI 服务暂时不可用，请稍后重试';
        useChatStore.getState().appendMessage({
          id: genMsgId(),
          role: 'assistant',
          content: `❌ ${msg}`,
        });
        // 401 时清除登录态，引导重新登录
        if (msg.includes('登录已过期') || msg.includes('401')) {
          useAppStore.getState().clearAuth();
          setTimeout(() => window.location.reload(), 1500);
        }
      } finally {
        useChatStore.getState().setLoading(false);
        useChatStore.getState().setWaitStage(0);
        abortRef.current = null;
      }
    },
    [parseRolePrefix, roleNames]
  );

  // ── AI 自动生成角色内容（角色扮演双击模式）──
  const autoGenerateRole = useCallback(
    async (role) => {
      if (useChatStore.getState().loading) return;
      useChatStore.getState().setLoading(true);

      const controller = new AbortController();
      abortRef.current = controller;

      const currentState = useChatStore.getState();
      const effRoleNames = roleNames;
      const roleLabel =
        role === 'ai' ? effRoleNames.ai : role === 'user' ? effRoleNames.user : '旁白';
      const roleDesc =
        role === 'ai'
          ? `你是${effRoleNames.ai}`
          : role === 'user'
            ? `你是${effRoleNames.user}`
            : '你是旁白叙述者';

      const ctx = currentState.messages
        .slice(-10)
        .map((m) =>
          `${m.role === 'user' ? (currentState.rolePrefix === 'user' ? effRoleNames.user : '用户') : effRoleNames.ai}: ${m.content}`
        )
        .join('\n');

      const prompt = `${roleDesc}。请根据以下对话上下文，以${roleLabel}的身份发言。要求：自然、符合角色设定、推动对话发展。直接输出内容，不加任何前缀。\n\n对话上下文：\n${ctx}\n\n${roleLabel}说：`;

      const msgRole = role === 'user' ? 'user' : 'assistant';
      const msgId = genMsgId();
      useChatStore.getState().appendMessage({
        id: msgId,
        role: msgRole,
        content: '',
        streaming: true,
      });

      try {
        await readChatStream(
          prompt,
          useChatStore.getState().sessionId,
          {
            characterId: currentState.characterId,
            parameters: currentState.character?.parameters || {},
            response_prompt: currentState.customResponsePrompt,
            signal: controller.signal,
          },
          {
            onChunk: (_chunk, fullText) =>
              useChatStore.getState().updateMessage(msgId, { content: fullText }),
            onDone: (event) =>
              useChatStore
                .getState()
                .updateMessage(msgId, { id: event.message_id || msgId, streaming: false }),
            onError: (msg) =>
              useChatStore.getState().updateMessage(msgId, {
                content: `❌ ${msg}`,
                streaming: false,
              }),
          }
        );
      } catch (err) {
        if (err.name === 'AbortError') {
          // 用户主动取消，静默
        } else {
          useChatStore.getState().appendMessage({
            id: genMsgId(),
            role: msgRole,
            content: '生成失败，请重试',
          });
        }
      } finally {
        useChatStore.getState().setLoading(false);
        abortRef.current = null;
      }
    },
    [roleNames]
  );

  // ── 重试某条 AI 消息 ──
  const retryMessage = useCallback(
    (msgIdx) => {
      if (useChatStore.getState().loading) return;
      const msgs = useChatStore.getState().messages;
      const prevUser = msgs.slice(0, msgIdx).filter((m) => m.role === 'user').pop();
      if (prevUser) {
        useChatStore.getState().removeMessagesFrom(msgIdx);
        // 从消息的 _context 还原发送时的角色/参数快照，retry 跳过 user 消息插入避免重复
        sendMessage(prevUser.content, prevUser._context || null, { retry: true });
      }
    },
    [sendMessage]
  );

  // ── 编辑用户消息后从该点重新对话 ──
  const editAndResend = useCallback(
    (msgIdx, newText) => {
      if (useChatStore.getState().loading) return;
      if (!newText.trim()) return;
      useChatStore.getState().removeMessagesFrom(msgIdx);
      sendMessage(newText);
    },
    [sendMessage]
  );

  return {
    sendMessage,
    autoGenerateRole,
    retryMessage,
    editAndResend,
    abort,
    roleNames,
    abortRef,
  };
}
