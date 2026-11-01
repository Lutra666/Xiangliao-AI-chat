import { create } from 'zustand';

// 自增 ID 生成器，避免 Date.now() 作为消息 key 在快速连续操作时冲突
let _msgIdCounter = 0;
export const genMsgId = () => `${Date.now()}-${++_msgIdCounter}`;

const INITIAL = {
  sessionId: null,
  newlyCreatedSessionId: null,
  messages: [],
  sessionTitle: '',
  memoryPausedAfterRecall: false,
  streaming: '',
  loading: false,
  waitStage: 0, // 0=无 1=思考中 2=组织语言 3=耐心等待
  lastTiming: null,
  sessionTokens: 0,
  character: null,
  rolePrefix: '',
  customResponsePrompt: '',
  showNewMsg: false,
};

export const useChatStore = create((set) => ({
  ...INITIAL,

  setSessionId: (sessionId, { created = false } = {}) =>
    set({ sessionId, newlyCreatedSessionId: created ? sessionId : null }),

  setMessages: (updater) =>
    set((state) => ({
      messages: typeof updater === 'function' ? updater(state.messages) : updater,
    })),

  appendMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),

  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),

  removeMessagesFrom: (idx) =>
    set((state) => ({ messages: state.messages.slice(0, idx) })),

  setStreaming: (streaming) => set({ streaming }),
  setLoading: (loading) => set({ loading }),
  setWaitStage: (waitStage) => set({ waitStage }),
  setLastTiming: (lastTiming) => set({ lastTiming }),
  setSessionTokens: (n) => set({ sessionTokens: n }),
  setSessionTitle: (sessionTitle) => set({ sessionTitle }),
  setCharacter: (character) => set({ character }),
  setRolePrefix: (rolePrefix) => set({ rolePrefix }),
  setCustomResponsePrompt: (customResponsePrompt) => set({ customResponsePrompt }),
  setShowNewMsg: (showNewMsg) => set({ showNewMsg }),

  // 切换会话 / 新建对话时重置聊天状态（保留 character 和 customResponsePrompt）
  resetForNewSession: () =>
    set({
      sessionId: null,
      newlyCreatedSessionId: null,
      messages: [],
      sessionTitle: '',
      memoryPausedAfterRecall: false,
      streaming: '',
      loading: false,
      waitStage: 0,
      lastTiming: null,
      sessionTokens: 0,
      showNewMsg: false,
    }),

  loadHistoryInto: (data) =>
    set({
      messages: data.messages || [],
      sessionTitle: data.title || '',
      memoryPausedAfterRecall: !!data.memory_paused_after_recall,
      sessionTokens: data.total_tokens_used || 0,
    }),

  // 完全重置（测试 / 登出用）
  reset: () => set(INITIAL),
}));
