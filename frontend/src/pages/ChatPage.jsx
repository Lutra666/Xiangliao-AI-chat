import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatHeader from '../features/chat/components/ChatHeader';
import ChatMessageList from '../features/chat/components/ChatMessageList';
import ChatInputBar from '../features/chat/components/ChatInputBar';
import { IconButton, Tooltip } from '../components/ui';
import { useChatStream, useCharacters, useHistory } from '../hooks';
import { useAutoScroll } from '../features/chat/hooks/useAutoScroll';
import { useChatStore } from '../store/useChatStore';
import { useAppStore } from '../store/useAppStore';

/**
 * 性能优化（解决长上下文下输入法卡顿）：
 *   - 移除顶层的 input/useDraft 状态，input 状态下沉到 ChatInputBar 内部。
 *     这样每次按键 input 变化只触发 ChatInputBar 自身重渲染，不再让 ChatPage 重渲染，
 *     进而让所有兄弟组件（Sidebar/ChatHeader/ChatMessageList）都不受影响。
 *   - 父组件通过 inputBarRef 命令式调用 ChatInputBar 的方法（insertPrefix/quickSend）。
 *   - onSend 改为接收 text 参数，而非读取顶层 input 状态。
 */
export default function ChatPage() {
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });

  // ── stores（订阅需要响应式更新的字段）──
  const sessionId = useChatStore((s) => s.sessionId);
  const streaming = useChatStore((s) => s.streaming);
  const characterId = useAppStore((s) => s.activeCharacterId);
  const setActiveCharacterId = useAppStore((s) => s.setActiveCharacterId);

  // ── 数据查询 ──
  const { data: characters = [] } = useCharacters(true);
  const character = useMemo(
    () => (characterId ? characters.find((c) => c.id === characterId) : null),
    [characters, characterId]
  );

  // 同步 character 到 chatStore
  useEffect(() => {
    useChatStore.getState().setCharacter(character || null);
  }, [character]);

  // ── 聊天流式 hook ──
  const { sendMessage, retryMessage, editAndResend, abort, autoGenerateRole, roleNames } =
    useChatStream();

  // ── 智能滚动（订阅 streaming，流式输出时持续滚到底；messages 由 ChatMessageList 内部订阅）──
  const { scrollContainerRef, bottomRef, showNewMsg, headerVisible, scrollToBottom } =
    useAutoScroll([streaming]);

  // ── 输入框命令式 ref ──
  const inputBarRef = useRef(null);

  // ── 历史加载 ──
  const { data: historyData } = useHistory(sessionId);
  useEffect(() => {
    if (historyData) {
      useChatStore.getState().loadHistoryInto({
        messages: historyData.messages,
        title: historyData.title,
        total_tokens_used: historyData.totalTokens,
      });
      if (historyData.characterId) setActiveCharacterId(historyData.characterId);
    }
  }, [historyData, setActiveCharacterId]);

  // ── 会话操作 ──
  const handleSelect = useCallback(
    (sid) => {
      abort();
      useChatStore.getState().setSessionId(sid);
      setShowSidebar(false);
      scrollToBottom();
    },
    [abort, scrollToBottom]
  );

  const handleNew = useCallback(() => {
    abort();
    useChatStore.getState().resetForNewSession();
    setShowSidebar(false);
    scrollToBottom();
  }, [abort, scrollToBottom]);

  const handleDeleteSession = useCallback(
    (deletedId) => {
      if (sessionId === deletedId) handleNew();
    },
    [sessionId, handleNew]
  );

  // ── 发送（由 ChatInputBar 内部调用，传入文本）──
  const handleSend = useCallback(
    (text) => {
      if (!text || useChatStore.getState().loading) return;
      useChatStore.getState().setRolePrefix('');
      sendMessage(text);
    },
    [sendMessage]
  );

  // ── 快捷发送（来自 ChatEmptyState 建议卡片）──
  const quickSend = useCallback(
    (text) => {
      inputBarRef.current?.quickSend(text);
    },
    []
  );

  // ── 角色扮演：单击插入前缀 ──
  const onInsertPrefix = useCallback(
    (role) => {
      const prefix =
        role === 'ai'
          ? `/${roleNames.ai}: `
          : role === 'user'
            ? `/${roleNames.user}: `
            : `/旁白: `;
      inputBarRef.current?.insertPrefix(prefix);
      useChatStore.getState().setRolePrefix(role);
    },
    [roleNames]
  );

  // ── 角色扮演：双击 AI 代写 ──
  const onAutoGenerate = useCallback(
    (role) => {
      autoGenerateRole(role);
    },
    [autoGenerateRole]
  );

  // ── 侧栏折叠持久化 ──
  const toggleSidebarCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', next ? '1' : '0'); } catch {}
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-bg transition-colors duration-slower">
      {showSidebar && (
        <div
          className="md:hidden fixed inset-0 bg-overlay backdrop-blur-sm z-30 animate-in fade-in duration-fast"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div
        className={`${showSidebar ? 'translate-x-0' : '-translate-x-full'} ${
          sidebarCollapsed ? 'md:hidden' : 'md:translate-x-0'
        } fixed md:static z-40 h-screen transition-transform duration-slow ease-out`}
      >
        <Sidebar
          activeId={sessionId}
          onSelect={handleSelect}
          onNew={handleNew}
          onRefresh={sessionId}
          onDeleteSession={handleDeleteSession}
          activeCharId={characterId}
          onSelectChar={setActiveCharacterId}
        />
      </div>

      {sidebarCollapsed && (
        <div className="hidden md:flex items-center px-2 border-r border-border">
          <Tooltip content="展开侧栏" side="right">
            <IconButton label="展开侧栏" variant="ghost" onClick={toggleSidebarCollapse}>
              <PanelLeftOpen className="w-5 h-5" />
            </IconButton>
          </Tooltip>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 relative bg-surface transition-colors duration-slower">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-rose-300/10 rounded-full blur-3xl" />
        </div>

        <ChatHeader
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          headerVisible={headerVisible}
          onAbort={abort}
        />

        {!sidebarCollapsed && (
          <button
            onClick={toggleSidebarCollapse}
            className="hidden md:flex absolute top-3.5 left-72 z-10 items-center justify-center
              w-7 h-7 rounded-md text-text-subtle hover:text-text hover:bg-surface-hover
              transition-all duration-fast cursor-pointer"
            title="收起侧栏"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}

        <ChatMessageList
          scrollContainerRef={scrollContainerRef}
          bottomRef={bottomRef}
          onRetry={retryMessage}
          onEditSubmit={editAndResend}
          onQuickSend={quickSend}
          showNewMsg={showNewMsg}
          onScrollToBottom={scrollToBottom}
        />

        <ChatInputBar
          ref={inputBarRef}
          sessionId={sessionId}
          onSend={handleSend}
          onAbort={abort}
          onInsertPrefix={onInsertPrefix}
          onAutoGenerate={onAutoGenerate}
        />
      </div>
    </div>
  );
}