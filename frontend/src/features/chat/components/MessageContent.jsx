import { useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { cn } from '../../../lib/cn';
import CodeBlock from './CodeBlock';

// ── 中文引号高亮 + 动作括号灰色 ──
// 递归处理 children，对字符串节点应用高亮
function highlightQuotes(text) {
  if (typeof text !== 'string') return text;
  const parts = [];
  let rest = text;
  let key = 0;
  // 匹配 "对话" 或 "对话"（中英文引号都支持）
  const quoteRe = /[""]([\s\S]*?)[""]/g;
  const actionRe = /（([\s\S]*?)）/g;
  let lastIdx = 0;
  let match;
  // 先找引号
  while ((match = quoteRe.exec(rest)) !== null) {
    if (match.index > lastIdx) parts.push(rest.slice(lastIdx, match.index));
    // 引号内再找动作括号
    const inner = match[1];
    const subParts = [];
    let subLast = 0;
    let am;
    while ((am = actionRe.exec(inner)) !== null) {
      if (am.index > subLast) subParts.push(<strong key={`q${key}-s${subParts.length}`} className="text-brand font-bold">{inner.slice(subLast, am.index)}</strong>);
      subParts.push(<span key={`q${key}-a${subParts.length}`} className="text-text-subtle">{am[0]}</span>);
      subLast = am.index + am[0].length;
    }
    if (subLast < inner.length) subParts.push(<strong key={`q${key}-s${subParts.length}`} className="text-brand font-bold">{inner.slice(subLast)}</strong>);
    parts.push(<span key={`q${key++}`}>"{subParts}"</span>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < rest.length) {
    // 剩余部分找独立动作括号
    const remaining = rest.slice(lastIdx);
    let rLast = 0;
    while ((match = actionRe.exec(remaining)) !== null) {
      if (match.index > rLast) parts.push(remaining.slice(rLast, match.index));
      parts.push(<span key={`a${key++}`} className="text-text-subtle">{match[0]}</span>);
      rLast = match.index + match[0].length;
    }
    if (rLast < remaining.length) parts.push(remaining.slice(rLast));
  }
  return parts.length ? parts : text;
}

function processChildren(children) {
  if (typeof children === 'string') return highlightQuotes(children);
  if (Array.isArray(children)) return children.map(processChildren);
  return children;
}

// 自定义组件映射
const components = {
  // 段落：应用中文引号高亮
  p: ({ children }) => <p className="leading-relaxed">{processChildren(children)}</p>,

  // 列表项
  li: ({ children }) => <li>{processChildren(children)}</li>,

  // 表格单元格
  td: ({ children }) => <td className="border border-border px-2 py-1">{processChildren(children)}</td>,
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-semibold bg-surface-hover">{processChildren(children)}</th>,

  // 标题
  h1: ({ children }) => <h1 className="text-lg font-bold my-2">{processChildren(children)}</h1>,
  h2: ({ children }) => <h2 className="text-base font-bold my-2">{processChildren(children)}</h2>,
  h3: ({ children }) => <h3 className="text-base font-bold my-2">{processChildren(children)}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-bold my-2">{processChildren(children)}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-bold my-2">{processChildren(children)}</h5>,
  h6: ({ children }) => <h6 className="text-sm font-bold my-2">{processChildren(children)}</h6>,

  // 引用
  blockquote: ({ children }) => (
    <blockquote className="border-l-[3px] border-brand/40 pl-3 my-2 text-text-muted italic">
      {children}
    </blockquote>
  ),

  // 列表
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,

  // 链接：只允许 http/https/相对路径
  a: ({ href, children }) => {
    if (!/^https?:\/\//i.test(href) && !href.startsWith('/')) return children;
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-brand underline hover:opacity-80">
        {children}
      </a>
    );
  },

  // 行内代码
  code: ({ className, children, ...props }) => {
    // code block 由 pre 处理，这里只处理行内
    const isBlock = typeof className === 'string' && className.startsWith('language-');
    if (isBlock) return <code className={className} {...props}>{children}</code>;
    return (
      <code className="bg-surface-hover px-1.5 py-0.5 rounded text-sm text-brand">
        {children}
      </code>
    );
  },

  // 代码块：用 CodeBlock 包装
  pre: ({ children }) => {
    // children 是 <code> 元素
    const codeEl = children?.props;
    const lang = (codeEl?.className || '').replace('language-', '') || '';
    const code = String(codeEl?.children ?? '');
    return <CodeBlock lang={lang} code={code} />;
  },

  // 表格
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-sm border-collapse">{children}</table>
    </div>
  ),

  // 加粗
  strong: ({ children }) => <strong className="text-brand font-bold">{processChildren(children)}</strong>,

  // 斜体
  em: ({ children }) => <em className="italic">{processChildren(children)}</em>,
};

export default function MessageContent({ content, isStreaming = false }) {
  const ref = useRef(null);
  return (
    <span ref={ref} className="bubble-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content || ''}
      </ReactMarkdown>
      {isStreaming && content && (
        <span
          className="typing-cursor inline-block w-0.5 h-4 bg-brand ml-0.5 align-middle animate-pulse"
          style={{ animationDuration: '0.7s' }}
        />
      )}
    </span>
  );
}
