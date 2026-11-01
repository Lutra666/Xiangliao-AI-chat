import { Card } from '../../../components/ui';
import { useSettings, useUpdateSettings, useListModels } from '../../../hooks';

const PARAMS = [
  { key: 'temperature', label: '创造性', min: 0, max: 2, step: 0.05, def: 0.7 },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.05, def: 0.9 },
  { key: 'max_tokens', label: '最大长度', min: 64, max: 8192, step: 64, def: 2048 },
];

export default function ParamsTab() {
  const { data: settings = {} } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: models = [] } = useListModels();

  const save = (data) => updateSettings.mutate(data);

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-text-subtle uppercase tracking-wider mb-4">
        默认参数
      </h2>
      <div className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-text mb-2">默认模型</label>
          <select
            value={settings.default_model || 'deepseek-v4-flash'}
            onChange={(e) => save({ default_model: e.target.value })}
            className="w-full border border-border bg-surface text-text rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.description}
              </option>
            ))}
          </select>
        </div>
        {PARAMS.map((p) => (
          <div key={p.key}>
            <div className="flex justify-between mb-1">
              <label className="text-xs font-medium text-text-muted">{p.label}</label>
              <span className="text-xs text-brand font-mono">
                {settings.default_parameters?.[p.key] ?? p.def}
              </span>
            </div>
            <input
              type="range"
              min={p.min}
              max={p.max}
              step={p.step}
              value={settings.default_parameters?.[p.key] ?? p.def}
              onChange={(e) => {
                const np = {
                  ...(settings.default_parameters || {}),
                  [p.key]: parseFloat(e.target.value),
                };
                save({ default_parameters: np });
              }}
              className="w-full accent-brand"
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
