import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import ChatHeader from '../features/chat/components/ChatHeader';
import ChatMessageList from '../features/chat/components/ChatMessageList';
import ChatInputBar from '../features/chat/components/ChatInputBar';
import { IconButton, Tooltip } from '../components/ui';
import { useChatStream, useCharacters, useHistory, useInheritSession } from '../hooks';
import { useAutoScroll } from '../features/chat/hooks/useAutoScroll';
import { useChatStore } from '../store/useChatStore';
import { useAppStore } from '../store/useAppStore';
import { recallMessage, storyRequest } from '../utils/api';
import StoryPanel from '../features/chat/components/StoryPanel';
import { useQueryClient } from '@tanstack/react-query';

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
  const [showStory, setShowStory] = useState(false);
  const [quote, setQuote] = useState(null);
  const pendingJump = useRef(null);
  const queryClient = useQueryClient();
  const recallingRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === '1'; } catch { return false; }
  });

  // ── stores（订阅需要响应式更新的字段）──
  const sessionId = useChatStore((s) => s.sessionId);
  const memoryPausedAfterRecall = useChatStore((s) => s.memoryPausedAfterRecall);
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
  const { sendMessage, editAndResend, abort, autoGenerateRole, roleNames } =
    useChatStream();

  // ── 智能滚动 ──
  const { scrollContainerRef, bottomRef, showNewMsg, scrollToBottom } =
    useAutoScroll();

  // ── 输入框命令式 ref ──
  const inputBarRef = useRef(null);

  // ── 历史加载 ──
  const { data: historyData } = useHistory(sessionId);
  const inheritSession = useInheritSession();
  useEffect(() => {
    if (historyData && !useChatStore.getState().loading) {
      useChatStore.getState().loadHistoryInto({
        messages: historyData.messages,
        title: historyData.title,
        memory_paused_after_recall: historyData.memoryPausedAfterRecall,
        total_tokens_used: historyData.totalTokens,
      });
      if (historyData.characterId) setActiveCharacterId(historyData.characterId);
      if (pendingJump.current) {
        const id = pendingJump.current;
        pendingJump.current = null;
        requestAnimationFrame(() => document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }
    }
  }, [historyData, setActiveCharacterId]);

  // ── 会话操作 ──
  const handleSelect = useCallback(
    (sid) => {
      abort();
      setQuote(null);
      useChatStore.getState().setSessionId(sid);
      setShowSidebar(false);
      scrollToBottom();
    },
    [abort, scrollToBottom]
  );

  const handleNew = useCallback(() => {
    abort();
    setQuote(null);
    useChatStore.getState().resetForNewSession();
    setShowSidebar(false);
    scrollToBottom();
  }, [abort, scrollToBottom]);

  const handleBranch = useCallback(async (messageId) => {
    if (!sessionId || inheritSession.isPending || useChatStore.getState().loading) return;
    try {
      const result = await inheritSession.mutateAsync({ sessionId, messageId });
      handleSelect(result.new_session_id);
    } catch (error) {
      alert(error.message || '创建剧情分支失败，请重试');
    }
  }, [sessionId, inheritSession, handleSelect]);

  const handleRecall = useCallback(async (messageId) => {
    if (recallingRef.current || useChatStore.getState().loading) return;
    recallingRef.current = true;
    try {
      const result = await recallMessage(messageId);
      if (useChatStore.getState().sessionId === result.session_id) {
        useChatStore.getState().updateMessage(messageId, { recalled: true, content: '' });
        useChatStore.setState({ memoryPausedAfterRecall: true });
      }
      await queryClient.invalidateQueries({ queryKey: ['history', result.session_id] });
    } catch (error) {
      alert(error.message || '撤回失败，请重试');
    } finally {
      recallingRef.current = false;
    }
  }, [queryClient]);

  const handleDeleteSession = useCallback(
    (deletedId) => {
      if (sessionId === deletedId) handleNew();
    },
    [sessionId, handleNew]
  );

  // ── 发送（由 ChatInputBar 内部调用，传入文本）──
  const handleSend = useCallback(
    (text, preferences = {}) => {
      if (!text || useChatStore.getState().loading) return;
      useChatStore.getState().setRolePrefix('');
      const lengths = { 简短: '回答简短，保留自然对话节奏。', 标准: '', 详细: '适当展开情绪、动作和场景细节。' };
      const tones = { 日常: '使用自然、轻松的日常口吻。', 剧情: '结合场景推进剧情，适量描写动作和环境。', 沉浸: '保持沉浸式角色扮演，让情绪通过细节自然呈现。' };
      sendMessage(text, null, { quoteId: quote?.id, stylePrompt: [lengths[preferences.length], tones[preferences.tone]].filter(Boolean).join('\n') });
      setQuote(null);
    },
    [sendMessage, quote]
  );

  const refreshHistory = useCallback((sid) => queryClient.invalidateQueries({ queryKey: ['history', sid] }), [queryClient]);
  const runVersion = useCallback(async (id, mode = 'retry') => {
    if (!sessionId || useChatStore.getState().loading) return;
    useChatStore.getState().setLoading(true);
    try {
      const result = await storyRequest(`/message/${id}/version?mode=${mode}`, { method: 'POST' });
      if (useChatStore.getState().sessionId === sessionId) {
        const current = useChatStore.getState().messages.find((m) => m.id === id);
        useChatStore.getState().updateMessage(id, { content: result.content, metadata: { ...current?.metadata, versions: result.versions, version_index: result.version_index } });
        useChatStore.setState({ memoryPausedAfterRecall: true });
      }
    } catch (error) { alert(error.message || '生成失败，请重试'); }
    finally { useChatStore.getState().setLoading(false); await refreshHistory(sessionId); }
  }, [sessionId, refreshHistory]);
  const retryMessage = useCallback((index) => {
    const message = useChatStore.getState().messages[index];
    if (typeof message?.id === 'number') runVersion(message.id);
    else alert('请等待消息保存完成后重试');
  }, [runVersion]);
  const selectVersion = useCallback(async (id, index) => {
    if (useChatStore.getState().loading) return;
    try {
      await storyRequest(`/message/${id}/version`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ index }) });
      await refreshHistory(sessionId);
    } catch (error) { alert(error.message || '切换版本失败'); }
  }, [sessionId, refreshHistory]);
  const bookmark = useCallback(async (message) => {
    const note = window.prompt('收藏备注（以 #节点 开头标记剧情节点；输入 /取消 可移除收藏）', message.metadata?.bookmark?.note || '');
    if (note === null) return;
    try {
      await storyRequest(`/message/${message.id}/bookmark`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved: note.trim() !== '/取消', note, node: note.startsWith('#节点') }) });
      await refreshHistory(sessionId);
    } catch (error) { alert(error.message || '收藏失败'); }
  }, [sessionId, refreshHistory]);

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
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-bg transition-colors duration-slower">
      {showSidebar && (
        <div
          className="md:hidden fixed inset-0 bg-overlay backdrop-blur-sm z-30 animate-in fade-in duration-fast"
          onClick={() => setShowSidebar(false)}
        />
      )}

      <div
        className={`${showSidebar ? 'translate-x-0' : '-translate-x-full'} ${
          sidebarCollapsed ? 'md:hidden' : 'md:translate-x-0'
        } fixed md:static z-40 h-full transition-transform duration-slow ease-out`}
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

      <div className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-surface transition-colors duration-slower">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-rose-300/10 rounded-full blur-3xl" />
        </div>

        <ChatHeader
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onAbort={abort}
          onOpenStory={() => setShowStory(true)}
        />
        {showStory && <StoryPanel sessionId={sessionId} onClose={() => setShowStory(false)} onOpenMessage={(sid, id) => {
          setShowStory(false);
          if (sid === sessionId) document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          else { pendingJump.current = id; handleSelect(sid); }
        }} />}

        {memoryPausedAfterRecall && (
          <div className="shrink-0 bg-surface-hover px-4 py-2 text-xs text-text-muted" role="status">
            本会话仅使用来源可确认且未失效的记忆；来源不明的旧记忆不会用于回复。
          </div>
        )}

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
          onBranch={handleBranch}
          onRecall={handleRecall}
          onQuote={(message) => { setQuote(message); inputBarRef.current?.focus(); }}
          onBookmark={bookmark}
          onContinue={(id) => runVersion(id, 'continue')}
          onSelectVersion={selectVersion}
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
          quote={quote}
          onClearQuote={() => setQuote(null)}
        />
      </div>
    </div>
  );
}
