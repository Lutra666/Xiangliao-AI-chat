import { useState } from 'react';
import {
  Heart, Search, Settings, Send, Plus, Trash2, Edit3, Copy,
  Check, X, ChevronDown, Sun, Moon, MessageSquare, BookOpen, Lightbulb,
} from 'lucide-react';
import {
  Button, IconButton, Card, CardHeader, CardBody, CardFooter,
  Input, Textarea, Avatar, Modal, Tooltip, Skeleton, Spinner, Badge,
} from '../components/ui';
import { useAppStore } from '../store/useAppStore';

function Section({ title, subtitle, children }) {
  return (
    <section className="mb-12">
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-text-header">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function DevPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const { theme, setTheme } = useAppStore();

  return (
    <div className="min-h-screen bg-bg transition-colors duration-slower">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-12">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-header tracking-tight">
                享聊 · 组件库预览
              </h1>
              <p className="text-text-muted mt-2">
                Apple/Stripe 柔和精致 · rose 现代化 · 设计 token 驱动
              </p>
            </div>
            <IconButton
              label={theme === 'dark' ? '切换亮色' : '切换暗色'}
              size="lg"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </IconButton>
          </div>
          <div className="flex flex-wrap gap-2 mt-6">
            <Badge variant="brand" dot>品牌色</Badge>
            <Badge variant="success" dot>成功</Badge>
            <Badge variant="warning" dot>警告</Badge>
            <Badge variant="danger" dot>危险</Badge>
            <Badge variant="info" dot>信息</Badge>
            <Badge variant="outline">描边</Badge>
            <Badge>默认</Badge>
          </div>
        </header>

        <Section title="Buttons" subtitle="6 种 variant × 4 种 size">
          <Button variant="primary" size="sm"><Heart className="w-3.5 h-3.5" /> Primary</Button>
          <Button variant="primary" size="md">Primary</Button>
          <Button variant="primary" size="lg">Primary Lg</Button>
          <Button variant="secondary"><Plus className="w-4 h-4" /> Secondary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="subtle">Subtle</Button>
          <Button variant="danger"><Trash2 className="w-4 h-4" /> Danger</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="primary" disabled>Disabled</Button>
        </Section>

        <Section title="Icon Buttons" subtitle="带 aria-label 的图标按钮">
          <IconButton label="搜索" variant="ghost"><Search className="w-5 h-5" /></IconButton>
          <IconButton label="设置" variant="ghost" size="lg"><Settings className="w-5 h-5" /></IconButton>
          <IconButton label="发送" variant="primary"><Send className="w-5 h-5" /></IconButton>
          <IconButton label="删除" variant="danger"><Trash2 className="w-5 h-5" /></IconButton>
          <IconButton label="激活态" active><MessageSquare className="w-5 h-5" /></IconButton>
          <IconButton label="禁用" disabled><X className="w-5 h-5" /></IconButton>
        </Section>

        <Section title="Avatar" subtitle="图片 / emoji / 首字母 · 渐变背景 · 在线指示">
          <Avatar src="" emoji="🥰" size="sm" gradient="gray" />
          <Avatar emoji="💻" size="md" gradient="brand" ring />
          <Avatar name="享聊" size="lg" gradient="brand" />
          <Avatar emoji="📚" size="xl" gradient="violet" />
          <Avatar emoji="🎨" size="2xl" gradient="gray" online />
        </Section>

        <Section title="Inputs" subtitle="支持 prefix/suffix 插槽">
          <Input placeholder="基础输入" />
          <Input placeholder="搜索..." prefix={<Search className="w-4 h-4" />} />
          <Input placeholder="带后缀" suffix={<Badge variant="brand" size="sm">⌘K</Badge>} />
          <Input placeholder="无效状态" invalid defaultValue="error" />
          <Textarea placeholder="多行输入，自动高度" autoResize rows={2} className="w-full max-w-md" />
        </Section>

        <Section title="Cards" subtitle="可悬停高亮">
          <Card className="w-72">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Avatar emoji="🥰" size="sm" gradient="brand" />
                <div>
                  <div className="text-sm font-semibold text-text">通用助手</div>
                  <div className="text-xs text-text-subtle">默认角色</div>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-text-muted">温暖友好的 AI 伙伴，适合日常聊天。</p>
            </CardBody>
            <CardFooter>
              <div className="flex gap-2 w-full">
                <Button variant="soft" size="sm" className="flex-1">选择</Button>
                <IconButton label="编辑" size="sm"><Edit3 className="w-4 h-4" /></IconButton>
              </div>
            </CardFooter>
          </Card>

          <Card hover className="w-72">
            <CardBody>
              <div className="flex items-start gap-3">
                <Avatar emoji="💡" size="md" gradient="brand" />
                <div className="min-w-0">
                  <div className="font-semibold text-text">悬停卡片</div>
                  <p className="text-sm text-text-muted mt-1">鼠标移上去会有阴影和边框变化。</p>
                </div>
              </div>
            </CardBody>
          </Card>
        </Section>

        <Section title="Feedback" subtitle="Tooltip / Skeleton / Spinner">
          <Tooltip content="这是一个提示" side="top">
            <Button variant="secondary">悬停看 Tooltip</Button>
          </Tooltip>
          <Tooltip content="右侧提示" side="right">
            <IconButton label="提示" variant="primary"><Lightbulb className="w-5 h-5" /></IconButton>
          </Tooltip>
          <div className="flex items-center gap-4">
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </div>
          <div className="w-64 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </Section>

        <Section title="Modal" subtitle="按 Esc 关闭 · 点击遮罩关闭">
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            打开 Modal
          </Button>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="确认操作"
            description="这个动作可能会影响你的会话数据。"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>取消</Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  <Check className="w-4 h-4" /> 确认
                </Button>
              </>
            }
          >
            <p className="text-sm text-text-muted">
              Modal 内容区。支持自定义 size、遮罩点击、Esc 关闭、滚动锁定。
            </p>
          </Modal>
        </Section>

        <Section title="Icon Gallery" subtitle="lucide-react 统一图标">
          <IconButton label="心" variant="ghost"><Heart className="w-5 h-5" /></IconButton>
          <IconButton label="复制" variant="ghost"><Copy className="w-5 h-5" /></IconButton>
          <IconButton label="编辑" variant="ghost"><Edit3 className="w-5 h-5" /></IconButton>
          <IconButton label="发送" variant="ghost"><Send className="w-5 h-5" /></IconButton>
          <IconButton label="消息" variant="ghost"><MessageSquare className="w-5 h-5" /></IconButton>
          <IconButton label="书本" variant="ghost"><BookOpen className="w-5 h-5" /></IconButton>
          <IconButton label="灯泡" variant="ghost"><Lightbulb className="w-5 h-5" /></IconButton>
          <IconButton label="下拉" variant="ghost"><ChevronDown className="w-5 h-5" /></IconButton>
        </Section>

        <footer className="mt-16 pt-8 border-t border-border text-center">
          <p className="text-xs text-text-subtle">
            享聊组件库 · 阶段 0 产物 · 仅开发环境可见
          </p>
        </footer>
      </div>
    </div>
  );
}
