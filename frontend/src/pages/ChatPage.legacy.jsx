import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import ChatBubble from '../components/ChatBubble';
import EmojiPicker from '../components/EmojiPicker';
import { getHistory, listCharacters, getStoredUser } from '../utils/api';
import { readChatStream } from '../utils/stream';
import { useTheme } from '../utils/theme';

// ── 时间感知建议 ──
const SUGGESTIONS = {
  morning: [
    { icon: '🌅', text: '早上好！今天有什么计划？' },
    { icon: '☕', text: '帮我规划今天的工作' },
    { icon: '📰', text: '今天有什么新闻？' },
  ],
  afternoon: [
    { icon: '💡', text: '帮我头脑风暴一个新想法' },
    { icon: '📝', text: '帮我写一段代码' },
    { icon: '🎯', text: '帮我分析一个问题' },
  ],
  evening: [
    { icon: '📖', text: '给我讲个故事' },
    { icon: '🤔', text: '帮我总结今天学到的内容' },
    { icon: '🌙', text: '推荐一本好书' },
  ],
  default: [
    { icon: '💬', text: '随便聊聊' },
    { icon: '💻', text: '帮我写代码' },
    { icon: '✍️', text: '帮我润色文字' },
    { icon: '🔍', text: '帮我查资料' },
    { icon: '🎨', text: '创意头脑风暴' },
    { icon: '📊', text: '分析数据' },
  ],
};

function getTimeSuggestions() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return SUGGESTIONS.morning;
  if (h >= 12 && h < 17) return SUGGESTIONS.afternoon;
  if (h >= 17 && h < 23) return SUGGESTIONS.evening;
  return SUGGESTIONS.default;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '早上好';
  if (h >= 12 && h < 14) return '中午好';
  if (h >= 14 && h < 18) return '下午好';
  if (h >= 18 && h < 23) return '晚上好';
  return '夜深了';
}

// ═══════════════════════════════════════════════════════

// 自增 ID 生成器，避免 Date.now() 作为消息 key 在快速连续操作时冲突
let _msgIdCounter = 0;
const genId = () => `${Date.now()}-${++_msgIdCounter}`;

export default function ChatPage() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const user = getStoredUser();

  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionTitle, setSessionTitle] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState('');
  const [waitStage, setWaitStage] = useState(0); // 0=无 1=思考中 2=组织语言 3=耐心等待
  const [showSidebar, setShowSidebar] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [characterId, setCharacterId] = useState(() => {
    try { return parseInt(localStorage.getItem('active_character_id') || '0') || null; }
    catch { return null; }
  });
  const [character, setCharacter] = useState(null);
  const [lastTiming, setLastTiming] = useState(null);
  const [sessionTokens, setSessionTokens] = useState(0); // 后端返回的真实会话累计 token
  const [userAvatar, setUserAvatar] = useState(user?.avatar_url || '');

  // 角色扮演按钮：单击=插入前缀，双击=AI生成
  const roleClickTimers = useRef({});
  const [rolePrefix, setRolePrefix] = useState(''); // 当前激活的角色前缀
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [editPrompt, setEditPrompt] = useState(() => localStorage.getItem('quick_response_prompt') || '');
  const [customResponsePrompt, setCustomResponsePrompt] = useState(() => localStorage.getItem('quick_response_prompt') || '');
  const [headerVisible, setHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const historyReqId = useRef(0); // 防止切换会话时历史加载竞态
  const autoScrollRef = useRef(true); // 是否自动滚动到底部（用户上滑时暂停）
  const [showNewMsg, setShowNewMsg] = useState(false); // 有新消息但用户在上方时显示提示

  // 智能滚动：用户上滑时暂停自动滚动，滑到底部时恢复
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      const dy = y - lastScrollY.current;
      if (Math.abs(dy) > 10) {
        setHeaderVisible(dy < 0);
      }
      lastScrollY.current = y;
      // 判断是否在底部附近（100px 容差）
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      autoScrollRef.current = atBottom;
      if (atBottom) setShowNewMsg(false);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // 消息或流式内容变化时滚动
  useEffect(() => {
    if (autoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      // 用户不在底部，有新消息时显示提示
      if (messages.length > 0) setShowNewMsg(true);
    }
  }, [messages, streaming]);

  // 首字前等待分阶段提示：3s 升级"组织语言"，10s 升级"耐心等待"
  // 一旦开始流式输出（streaming 非空）或停止 loading 立即重置
  useEffect(() => {
    if (!loading || streaming) {
      setWaitStage(0);
      return;
    }
    setWaitStage(1);
    const t1 = setTimeout(() => setWaitStage(2), 3000);
    const t2 = setTimeout(() => setWaitStage(3), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [loading, streaming]);

  // 草稿自动保存：按会话ID缓存输入内容
  const draftKey = sessionId ? `draft_${sessionId}` : 'draft_new';
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved && saved !== input) setInput(saved);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    try {
      if (input) localStorage.setItem(draftKey, input);
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [input, draftKey]);

  // 加载角色信息
  useEffect(() => {
    let cancelled = false;
    if (characterId) {
      listCharacters(true).then(chars => {
        if (cancelled) return;
        const found = chars.find(c => c.id === characterId);
        if (!cancelled && found) setCharacter(found);
      }).catch(() => {});
      localStorage.setItem('active_character_id', String(characterId));
    } else {
      setCharacter(null);
      localStorage.removeItem('active_character_id');
    }
    return () => { cancelled = true; };
  }, [characterId]);

  const loadHistory = async (sid) => {
    try {
      const myReqId = ++historyReqId.current;
      const data = await getHistory(sid);
      // 不是最新请求（用户已切换到其他会话），丢弃过期结果
      if (myReqId !== historyReqId.current) return;
      setMessages(data.messages);
      setSessionTitle(data.title || '');
      setSessionTokens(data.total_tokens_used || 0);
      if (data.character_id) setCharacterId(data.character_id);
    } catch (e) { console.debug('加载历史失败', e); }
  };

  const handleSelect = (sid) => {
    // 切换前保存当前草稿（已在 useEffect 中自动保存）
    setSessionId(sid);
    // 切换后恢复目标会话草稿
    try {
      const saved = localStorage.getItem(`draft_${sid}`);
      setInput(saved || '');
    } catch { setInput(''); }
    loadHistory(sid);
    setShowSidebar(false);
    autoScrollRef.current = true;
    setShowNewMsg(false);
  };
  const handleNew = () => {
    abortRef.current?.abort();
    setSessionId(null); setMessages([]); setSessionTitle('');
    setStreaming(''); setLastTiming(null); setSessionTokens(0); setShowSidebar(false);
    // 恢复新对话草稿
    try {
      const saved = localStorage.getItem('draft_new');
      setInput(saved || '');
    } catch { setInput(''); }
    autoScrollRef.current = true;
    setShowNewMsg(false);
  };
  const handleDeleteSession = (deletedId) => { if (sessionId === deletedId) handleNew(); };

  const handleRetry = (msgIdx) => {
    if (loading) return;
    const prevUser = messages.slice(0, msgIdx).filter(m => m.role === 'user').pop();
    if (prevUser) {
      setMessages(prev => prev.slice(0, msgIdx));
      // 从消息的 _context 还原发送时的角色/参数快照，retry 模式跳过 user 消息插入避免重复
      sendMessage(prevUser.content, prevUser._context || null, { retry: true });
    }
  };

  // 编辑用户消息后从该点重新对话：截断该消息及之后所有消息，重新发送
  const handleEditSubmit = (msgIdx, newText) => {
    if (loading) return;
    if (!newText.trim()) return;
    setMessages(prev => prev.slice(0, msgIdx));
    sendMessage(newText);
  };

  const quickSend = (text) => {
    setInput(text);
    setTimeout(() => { setInput(''); sendMessage(text); }, 50);
  };

  // ═════════════════════════════════════════
  // 角色扮演按钮：单击=插入前缀，双击=AI代生成
  // ═════════════════════════════════════════
  const roleNames = {
    ai: character?.name || 'AI',
    user: user?.display_name || '我',
    narrator: '旁白',
  };

  const handleRoleButton = (role) => (e) => {
    const now = Date.now();
    const prev = roleClickTimers.current[role] || 0;

    if (now - prev < 350) {
      // ── 双击：AI 自动生成 ──
      roleClickTimers.current[role] = 0;
      setRolePrefix('');
      autoGenerateRole(role);
    } else {
      // ── 单击：插入前缀 ──
      roleClickTimers.current[role] = now;
      const prefix = role === 'ai' ? `/${roleNames.ai}: ` : role === 'user' ? `/${roleNames.user}: ` : `/旁白: `;
      setInput(prev => {
        // 如果已有同角色前缀，移除
        const cleaned = prev.replace(/^\/[^\n:]*: /, '');
        return prefix + cleaned;
      });
      setRolePrefix(role);
      textareaRef.current?.focus();
      // 超时后重置双击检测
      setTimeout(() => { roleClickTimers.current[role] = 0; }, 400);
    }
  };

  // AI 自动生成角色内容
  const autoGenerateRole = async (role) => {
    if (loading) return;
    setLoading(true);

    // 创建独立的 AbortController，避免复用上一次请求的控制器
    const controller = new AbortController();
    abortRef.current = controller;

    const roleLabel = role === 'ai' ? roleNames.ai : role === 'user' ? roleNames.user : '旁白';
    const roleDesc = role === 'ai' ? `你是${roleNames.ai}` : role === 'user' ? `你是${roleNames.user}` : '你是旁白叙述者';

    // 构建上下文
    const ctx = messages.slice(-10).map(m =>
      `${m.role === 'user' ? (rolePrefix === 'user' ? roleNames.user : '用户') : roleNames.ai}: ${m.content}`
    ).join('\n');

    const prompt = `${roleDesc}。请根据以下对话上下文，以${roleLabel}的身份发言。要求：自然、符合角色设定、推动对话发展。直接输出内容，不加任何前缀。\n\n对话上下文：\n${ctx}\n\n${roleLabel}说：`;

    // 提到 try 外，catch 块才能引用（否则 catch 自己抛 ReferenceError）
    const msgRole = role === 'user' ? 'user' : 'assistant';
    const msgId = genId();

    try {
      setMessages(prev => [...prev, { id: msgId, role: msgRole, content: '', streaming: true }]);
      await readChatStream(prompt, sessionId,
        { characterId, parameters: character?.parameters || {}, response_prompt: customResponsePrompt, signal: controller.signal },
        {
          onChunk: (_chunk, fullText) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m)),
          onDone: (event) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, id: event.message_id || msgId, streaming: false } : m)),
          onError: (msg) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: `❌ ${msg}`, streaming: false } : m)),
        });
    } catch (err) {
      if (err.name === 'AbortError') { /* 用户主动取消，静默 */ }
      else setMessages(prev => [...prev, { id: genId(), role: msgRole, content: '生成失败，请重试' }]);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  // ═════════════════════════════════════════
  // SSE 流式聊天
  // ═════════════════════════════════════════
  const sendMessage = async (q, ctxOverride, options = {}) => {
    const rawInput = q || input.trim();
    if (!rawInput || loading) return;
    if (!q) { setInput(''); }
    setStreaming(''); setLastTiming(null);
    const { retry = false } = options || {};

    // ctxOverride 用于重试时还原原消息的上下文快照
    const effCharacterId = ctxOverride?.characterId ?? characterId;
    const effCharacter = ctxOverride?.character ?? character;
    const effResponsePrompt = ctxOverride?.response_prompt ?? customResponsePrompt;
    const effRolePrefix = ctxOverride?.rolePrefix ?? rolePrefix;
    const effRoleNames = ctxOverride?.roleNames ?? roleNames;

    // 解析角色前缀
    const prefixMatch = rawInput.match(/^\/(.+?): (.+)/);
    const currentRolePrefix = prefixMatch
      ? (prefixMatch[1] === effRoleNames.ai ? 'ai' : prefixMatch[1] === effRoleNames.user ? 'user' : 'narrator')
      : effRolePrefix;
    const cleanText = prefixMatch ? prefixMatch[2] : rawInput;

    const controller = new AbortController();
    abortRef.current = controller;

    // ── 角色扮演模式：AI润色扩写后以角色身份发出 ──
    if (currentRolePrefix && prefixMatch) {
      const roleLabel = currentRolePrefix === 'ai' ? effRoleNames.ai : currentRolePrefix === 'user' ? effRoleNames.user : '旁白';

      setLoading(true);
      setRolePrefix('');

      // 构建上下文
      const ctx = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');

      const polishPrompt = `你是${roleLabel}。用户想让你说这段话（可能需要润色或扩写）："${cleanText}"

请将这段话自然地润色、扩写，使其更符合${roleLabel}的角色设定和当前对话语境。要求：
1. 保持原意，但让表达更生动自然
2. 适当扩写，不要太简短
3. 完全以${roleLabel}的口吻和身份来说
4. 只输出最终内容，不要加任何前缀、说明或引号

${ctx ? `\n对话上下文：\n${ctx}` : ''}`;

      try {
        const msgRole = currentRolePrefix === "user" ? "user" : "assistant";
        const msgId = genId();
        setMessages(prev => [...prev, { id: msgId, role: msgRole, content: '', asRole: roleLabel, streaming: true }]);

        await readChatStream(polishPrompt, sessionId,
          {
            characterId: effCharacterId,
            parameters: effCharacter?.parameters || {},
            response_prompt: effResponsePrompt,
            signal: abortRef.current?.signal,
          },
          {
            onChunk: (_chunk, fullText) => {
              setStreaming(fullText);
              setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: fullText } : m));
            },
            onDone: (event) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, id: event.message_id || msgId, streaming: false } : m)),
            onError: (msg) => setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: `❌ ${msg}`, streaming: false } : m)),
          });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: '润色失败，请重试' }]);
        }
      } finally {
        setLoading(false); setStreaming('');
        abortRef.current = null;
      }
      return;
    }

    // 保存发送时的上下文快照到用户消息，用于重试还原
    const msgContext = {
      characterId: effCharacterId,
      character: effCharacter,
      response_prompt: effResponsePrompt,
      rolePrefix: currentRolePrefix,
      roleNames: effRoleNames,
    };

    // ── 普通消息 ──
    // retry 模式（重试）下不重复插入 user 消息，因为 handleRetry 已保留原 user 消息
    if (!retry) {
      setMessages(prev => [...prev, { id: genId(), role: 'user', content: rawInput, _context: msgContext }]);
    }
    setLoading(true);
    if (!q) setRolePrefix('');

    const aiMsgId = genId();
    try {
      setMessages(prev => [...prev, { id: aiMsgId, role: 'assistant', content: '', streaming: true }]);
      await readChatStream(rawInput, sessionId,
        {
          characterId: effCharacterId,
          parameters: effCharacter?.parameters || {},
          response_prompt: effResponsePrompt,
          signal: abortRef.current?.signal,
        },
        {
          onChunk: (_chunk, fullText) => {
            setStreaming(fullText);
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, content: fullText } : m));
          },
          onTiming: (event) => {
            const timing = { ttft_ms: event.ttft_ms, total_ms: event.total_ms, cached: event.cached };
            setLastTiming(timing);
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, timing } : m));
          },
          onUsage: (event) => {
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, tokenCount: event.answer_tokens } : m));
            if (event.session_total != null) setSessionTokens(event.session_total);
          },
          onDone: (event) => {
            if (!sessionId) setSessionId(event.session_id);
            setMessages(prev => prev.map(m => m.id === aiMsgId ? {
              ...m,
              id: event.message_id || m.id,
              streaming: false,
              sources: event.sources || m.sources,
            } : m));
          },
          onError: (msg) => setMessages(prev => prev.map(m => m.streaming ? { ...m, content: `❌ ${msg}`, streaming: false } : m)),
        });
      setStreaming('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      const msg = err?.message || 'AI 服务暂时不可用，请稍后重试';
      setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: `❌ ${msg}` }]);
      // 401 时清除登录态，引导重新登录
      if (msg.includes('登录已过期') || msg.includes('401')) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setTimeout(() => window.location.reload(), 1500);
      }
    } finally { setLoading(false); setWaitStage(0); abortRef.current = null; }
  };

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [input]);

  const handleEmoji = (emoji) => { setInput(prev => prev + emoji); setShowEmoji(false); textareaRef.current?.focus(); };

  const suggestions = getTimeSuggestions();
  const greeting = getGreeting();

  return (
    <div className="flex h-screen overflow-hidden bg-rose-50/30 dark:bg-[#1a1016] transition-colors">
      {/* ── 移动端遮罩 ── */}
      {showSidebar && (
        <div className="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-30" onClick={() => setShowSidebar(false)} />
      )}

      {/* ── 侧边栏 ── */}
      <div className={`${showSidebar ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:static z-40 h-screen transition-transform duration-300 ease-out`}>
        <Sidebar activeId={sessionId} onSelect={handleSelect} onNew={handleNew}
          onRefresh={sessionId} onDeleteSession={handleDeleteSession} />
      </div>

      {/* ═════════════════════════════════════════ */}
      {/* 主聊天区 */}
      {/* ═════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-white dark:bg-[#241e36] transition-colors">

        {/* 装饰背景 */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-brand/5 dark:bg-brand/3 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 bg-violet-200/20 dark:bg-violet-200/5 rounded-full blur-3xl" />
        </div>

        {/* ── 顶部栏：设置(左) | 角色名 | 主题切换(右) ── */}
        <header className={`border-b border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between
          px-3 md:px-5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl fixed top-0 left-0 right-0 md:static z-20 shrink-0
          transition-transform duration-300 ${headerVisible ? 'translate-y-0' : '-translate-y-full'}`}
          style={{ paddingTop: 'max(36px, env(safe-area-inset-top, 0px))', minHeight: 56 }}>
          {/* 左侧：菜单 + 设置 */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSidebar(!showSidebar)}
              className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* 全屏按钮 - 仅手机端 */}
            <button onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen();
            }}
              className="md:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition cursor-pointer"
              title="全屏">
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>

            {/* 设置按钮 - 左上角 */}
            <button onClick={() => navigate('/settings')}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
              title="设置">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {/* 当前角色名 */}
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:inline">
              {character ? `${character.avatar_url} ${character.name}` : ''}
            </span>
          </div>

          {/* 右侧：主题 + 停止 */}
          <div className="flex items-center gap-1">
            {/* 当前会话真实 token 用量与估算费用（数据来自后端 session_total） */}
            {sessionId && sessionTokens > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-600 hidden sm:inline" title="本会话累计 token 用量">
                🔤 {(sessionTokens / 1000).toFixed(1)}k
              </span>
            )}
            {sessionId && sessionTokens > 0 && (
              <span className="text-[10px] text-gray-400 dark:text-gray-600 hidden sm:inline"
                title="基于真实 token 的估算费用（按 ¥2/百万 token）">
                ≈¥{((sessionTokens / 1000000) * 2).toFixed(3)}
              </span>
            )}
            <h1 className="text-[13px] font-medium text-gray-400 dark:text-gray-500 truncate max-w-[120px] md:max-w-[200px] hidden sm:block">
              {sessionId ? (sessionTitle || '对话中…') : '新对话'}
            </h1>

            <button onClick={toggleTheme}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
              title={theme === 'dark' ? '切换亮色模式' : '切换暗色模式'}>
              {theme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {loading && (
              <button onClick={() => abortRef.current?.abort()}
                className="p-2 rounded-xl text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
          </div>
        </header>

        {/* ═════════════════════════════════════════ */}
        {/* 消息区 */}
        {/* ═════════════════════════════════════════ */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 md:px-8 pt-14 md:pt-6 pb-6">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 ? (
              /* 空状态 */
              <div className="flex flex-col items-center justify-center pt-10 md:pt-20">
                {/* Logo */}
                <div className="relative mb-8">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-rose-400 to-pink-500
                    flex items-center justify-center shadow-2xl shadow-brand/20 animate-in zoom-in-95 duration-500">
                    {userAvatar ? (
                      <img src={userAvatar} alt="" className="w-full h-full rounded-3xl object-cover" />
                    ) : (
                      <span className="text-4xl md:text-5xl">{character?.avatar_url || '🥰'}</span>
                    )}
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-rose-400 rounded-full border-2 border-white dark:border-gray-900
                    flex items-center justify-center">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  </div>
                </div>

                <h2 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-500
                  dark:from-gray-100 dark:to-gray-400 bg-clip-text text-transparent mb-2
                  animate-in fade-in slide-in-from-bottom-4 duration-500">
                  {greeting}{character ? `，我是 ${character.name}` : '，我是享聊'}
                </h2>
                <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 max-w-xs text-center leading-relaxed">
                  {character?.description || '选择一个角色开始对话，或者直接告诉我你想聊什么。'}
                </p>

                {lastTiming && (
                  <div className="flex items-center gap-2 mb-8 px-4 py-2 bg-gray-100/60 dark:bg-gray-800/60
                    rounded-full border border-gray-200/50 dark:border-gray-700/50 text-[11px] text-gray-400 dark:text-gray-500">
                    <span>⚡</span>
                    上次响应：
                    {lastTiming.cached ? '缓存命中 (0s)' : `思考 ${(lastTiming.ttft_ms / 1000).toFixed(1)}s · 总计 ${(lastTiming.total_ms / 1000).toFixed(1)}s`}
                  </div>
                )}

                {/* 建议 */}
                <div className="w-full max-w-md">
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mb-3 text-center tracking-wider uppercase">
                    💡 试试这些
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => quickSend(s.text)}
                        className="group flex flex-col items-center gap-2 p-3.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750
                          rounded-2xl border border-gray-100 dark:border-gray-700 hover:border-brand/20 dark:hover:border-brand/30
                          hover:shadow-lg hover:shadow-brand/5 transition-all duration-200 cursor-pointer hover:-translate-y-0.5
                          animate-in fade-in slide-in-from-bottom-2"
                        style={{ animationDelay: `${i * 60}ms`, animationFillMode: 'both' }}>
                        <span className="text-2xl group-hover:scale-110 transition-transform duration-200">{s.icon}</span>
                        <span className="text-[11px] text-gray-600 dark:text-gray-300 text-center leading-tight group-hover:text-brand">{s.text}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-10 flex flex-wrap items-center justify-center gap-4 text-[10px] text-gray-300 dark:text-gray-600">
                  <span>⌨️ Enter 发送</span><span>⇧ Enter 换行</span><span>🎭 切换角色</span><span>🎚️ 调节参数</span>
                </div>
              </div>
            ) : (
              <div>
                {messages.map((m, idx) => (
                  <ChatBubble
                    key={m.id}
                    role={m.role}
                    content={m.content}
                    sources={m.sources}
                    timing={m.timing}
                    tokenCount={m.tokenCount}
                    userAvatar={userAvatar}
                    aiAvatar={character?.avatar_url || '🥰'}
                    asRole={m.asRole}
                    isDraft={m.isDraft}
                    isStreaming={m.streaming}
                    createdAt={m.created_at}
                    onRetry={m.role === 'assistant' ? () => handleRetry(idx) : null}
                    onEditSubmit={m.role === 'user' && !m.streaming ? (newText) => handleEditSubmit(idx, newText) : null}
                  />
                ))}
              </div>
            )}

            {loading && !streaming && (
              <div className="flex items-center gap-3 text-brand/60 text-sm mb-6">
                <div className="flex gap-1 bg-brand/5 dark:bg-brand/10 px-3 py-2 rounded-full border border-brand/10">
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                </div>
                <span className="font-medium text-brand/70">
                  {waitStage === 3 ? '还在思考，内容较多请耐心等待…' :
                   waitStage === 2 ? '正在组织语言…' :
                   '思考中…'}
                </span>
              </div>
            )}
            {streaming && (
              <div className="text-[10px] text-brand/40 ml-1 mb-4 flex items-center gap-2">
                <span className="w-1 h-1 bg-brand/40 rounded-full animate-ping" />
                <span>输出中</span>
                <span className="inline-block w-2 h-3.5 bg-brand/60 rounded-sm animate-pulse" style={{ animationDuration: '0.8s' }} />
              </div>
            )}
            <div ref={bottomRef} className="h-4" />

            {/* 新消息提示（用户上滑时有新消息） */}
            {showNewMsg && !loading && (
              <button
                onClick={() => {
                  autoScrollRef.current = true;
                  setShowNewMsg(false);
                  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="fixed left-1/2 -translate-x-1/2 bottom-32 z-20 px-4 py-1.5
                  bg-brand text-white text-xs rounded-full shadow-lg shadow-brand/30
                  hover:bg-brand-dark transition-all cursor-pointer animate-in fade-in slide-in-from-bottom-2"
              >
                ↓ 新消息
              </button>
            )}
          </div>
        </div>

        {/* ═════════════════════════════════════════ */}
        {/* 输入区 */}
        {/* ═════════════════════════════════════════ */}
        <div className="p-3 md:p-5 bg-gradient-to-t from-white via-white/95 dark:from-gray-900 dark:via-gray-900/95 to-transparent shrink-0 transition-colors">
          <div className="max-w-3xl mx-auto">
            {/* ── 角色扮演按钮 ── */}
            <div className="flex items-center gap-1.5 mb-2 ml-1">
              {['ai', 'user', 'narrator'].map(role => {
                const label = role === 'ai' ? `${character?.avatar_url || '🥰'} ${roleNames.ai}` :
                  role === 'user' ? `👤 ${roleNames.user}` : '📖 旁白';
                const isActive = rolePrefix === role;
                return (
                  <button key={role} onClick={handleRoleButton(role)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer
                      ${isActive
                        ? 'bg-brand text-white shadow-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:border-brand/30 hover:text-brand'
                      }`}
                    title={`单击：输入${roleNames[role] ? '以' + roleNames[role] + '身份发言' : ''} | 双击：AI自动生成`}>
                    {label}
                  </button>
                );
              })}
              {rolePrefix && (
                <span className="text-[10px] text-gray-400 animate-pulse">
                  已激活 · 双击让AI代写
                </span>
              )}
              {/* 编辑按钮——实时修改回复风格 */}
              <div className="relative">
                <button onClick={() => setShowEditPanel(!showEditPanel)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition cursor-pointer
                    ${showEditPanel
                      ? 'bg-brand text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 hover:border-brand/30 hover:text-brand'
                    }`}
                  title="编辑当前回复风格">
                  ✏️ 编辑
                </button>
              </div>
            </div>

            {/* 编辑面板 */}
            {showEditPanel && (
              <div className="mb-2 p-3 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm animate-in fade-in">
                <textarea className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 rounded-xl px-3 py-2 text-xs"
                  rows="3" placeholder="输入回复风格指令，如：回复要俏皮可爱，多用颜文字，每句话都要加~"
                  value={editPrompt}
                  onChange={e => setEditPrompt(e.target.value)} />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => {
                    setCustomResponsePrompt(editPrompt);
                    localStorage.setItem('quick_response_prompt', editPrompt);
                    setShowEditPanel(false);
                  }}
                    className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-medium hover:bg-brand-dark cursor-pointer">
                    应用
                  </button>
                  <button onClick={() => { setEditPrompt(''); setCustomResponsePrompt(''); localStorage.removeItem('quick_response_prompt'); setShowEditPanel(false); }}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg cursor-pointer">
                    重置
                  </button>
                </div>
              </div>
            )}

            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-brand/5 via-violet-200/10 to-brand/5
                dark:from-brand/10 dark:via-violet-500/5 dark:to-brand/10
                rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <textarea
                ref={textareaRef} rows="1" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setRolePrefix(''); sendMessage(); } }}
                placeholder={loading ? `AI 正在回复中，你可以先输入下一条...` : `和 ${character?.name || '享聊'} 聊点什么吧...`}
                className="relative w-full bg-white dark:bg-gray-800 border border-gray-200/80 dark:border-gray-700/80
                  rounded-2xl pl-4 pr-28 py-3.5 text-[14px] leading-relaxed
                  placeholder:text-gray-300 dark:placeholder:text-gray-600
                  focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40
                  focus:bg-white dark:focus:bg-gray-800 transition-all resize-none shadow-sm
                  hover:shadow-md hover:border-gray-300/80 dark:hover:border-gray-600/80
                  dark:text-gray-100"
              />

              <div className="absolute right-2 top-1.5 flex items-center gap-0.5">
                <button onClick={() => setShowEmoji(!showEmoji)}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600
                    dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer">
                  <span className="text-lg">😊</span>
                </button>
                {showEmoji && <EmojiPicker onSelect={handleEmoji} onClose={() => setShowEmoji(false)} />}
                <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    input.trim() && !loading
                      ? 'bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-md shadow-brand/20 hover:scale-105 active:scale-95'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-600'
                  }`}>
                  <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <p className="text-center text-[10px] text-gray-300 dark:text-gray-600 mt-2.5 select-none">
              AI 生成内容仅供参考 · DeepSeek V4 Flash 驱动 · 1M 上下文
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
