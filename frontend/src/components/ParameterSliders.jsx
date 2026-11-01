import { useState } from 'react';

const DEFAULTS = {
  temperature: { value: 0.7, min: 0, max: 2, step: 0.05, label: '创造性', desc: '越高越有创意，越低越严谨' },
  top_p: { value: 0.9, min: 0, max: 1, step: 0.05, label: 'Top P', desc: '核采样参数，控制词汇多样性' },
  max_tokens: { value: 2048, min: 64, max: 8192, step: 64, label: '最大长度', desc: '回复的最大 token 数' },
};

export default function ParameterSliders({ parameters, onChange, onClose }) {
  const [params, setParams] = useState({ ...DEFAULTS, ...parameters });

  const handleChange = (key, value) => {
    const updated = { ...params, [key]: { ...params[key], value } };
    setParams(updated);
    const flat = {};
    Object.keys(DEFAULTS).forEach(k => { flat[k] = updated[k].value; });
    onChange(flat);
  };

  return (
    <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4 w-[280px] z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">参数调节</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {Object.entries(params).map(([key, p]) => (
        <div key={key} className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <label className="text-xs font-medium text-gray-600">{p.label}</label>
            <span className="text-xs text-brand font-mono">{typeof p.value === 'number' && p.value < 1 ? p.value.toFixed(2) : p.value}</span>
          </div>
          <input
            type="range" min={p.min} max={p.max} step={p.step} value={p.value}
            onChange={e => handleChange(key, parseFloat(e.target.value))}
            className="w-full h-1.5 bg-gray-200 rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:rounded-full"
          />
          <p className="text-[10px] text-gray-400 mt-0.5">{p.desc}</p>
        </div>
      ))}
    </div>
  );
}

// 导出默认值供外部使用
export function getDefaultParams() {
  const flat = {};
  Object.keys(DEFAULTS).forEach(k => { flat[k] = DEFAULTS[k].value; });
  return flat;
}
