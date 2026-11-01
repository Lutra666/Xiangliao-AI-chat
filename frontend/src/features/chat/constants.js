// 时间感知建议与问候语

export const SUGGESTIONS = {
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

export function getTimeSuggestions() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return SUGGESTIONS.morning;
  if (h >= 12 && h < 17) return SUGGESTIONS.afternoon;
  if (h >= 17 && h < 23) return SUGGESTIONS.evening;
  return SUGGESTIONS.default;
}

export function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return '早上好';
  if (h >= 12 && h < 14) return '中午好';
  if (h >= 14 && h < 18) return '下午好';
  if (h >= 18 && h < 23) return '晚上好';
  return '夜深了';
}
