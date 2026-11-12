// src/components/garden/ProfileEditor.tsx
// 🪪 档案编辑：只在站主登录后出现在档案弹窗里。改完一次保存整份（useSiteProfile.saveSiteProfile）。
import React, { useRef, useState } from 'react';
import { saveSiteProfile, uploadAvatar, type SiteProfile } from '../../hooks/useSiteProfile';

interface Props {
  initial: SiteProfile;
  onDone: () => void;
}

// 宽度不写在基类里：w-full 与 w-28 同时出现时 Tailwind 按样式表顺序取胜，左格会被撑满、把右格挤没
const baseCls = 'rounded-xl bg-white/60 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400/70 focus:outline-none focus:border-[#39C5BB]/70 transition-colors';
const inputCls = `w-full ${baseCls}`;
const keyCls = `w-28 shrink-0 ${baseCls}`;
const valCls = `flex-1 min-w-0 ${baseCls}`;
const labelCls = 'block font-mono text-[9px] tracking-[0.25em] uppercase text-[#39C5BB]/80 mb-1.5';
const smallBtn = 'font-mono text-[10px] tracking-[0.15em] uppercase text-slate-400 hover:text-[#39C5BB] transition-colors';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block"><span className={labelCls}>{label}</span>{children}</label>
);

export const ProfileEditor: React.FC<Props> = ({ initial, onDone }) => {
  const [draft, setDraft] = useState<SiteProfile>(initial);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof SiteProfile>(k: K, v: SiteProfile[K]) => setDraft(d => ({ ...d, [k]: v }));

  const onPickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setMsg('图片太大了，换一张 5 MB 以内的'); return; }
    setUploading(true); setMsg('');
    try {
      set('avatar', await uploadAvatar(file));
    } catch (err) {
      setMsg(`头像上传失败：${(err as Error).message}（是否已跑 site_profile.sql？）`);
    } finally { setUploading(false); }
  };

  const onSave = async () => {
    setSaving(true); setMsg('');
    try {
      await saveSiteProfile({
        ...draft,
        now: draft.now.filter(x => x.k.trim() || x.v.trim()),
        interests: draft.interests.filter(x => x.tag.trim()),
      });
      onDone();
    } catch (err) {
      setMsg(`已存到本机，但云端保存失败：${(err as Error).message}`);
    } finally { setSaving(false); }
  };

  return (
    <div className="z-10 flex flex-col gap-5 text-left">
      <div className="font-serif text-xl text-slate-700 dark:text-slate-100 text-center">编辑档案</div>

      {/* 头像 */}
      <div className="flex items-center gap-4">
        <div className="w-20 h-20 rounded-full overflow-hidden border border-white/70 dark:border-white/15 shadow-lg shrink-0 bg-white/30 dark:bg-white/5">
          <img src={draft.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.opacity = '0'; }} onLoad={(e) => { e.currentTarget.style.opacity = '1'; }} />
        </div>
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
            className="self-start px-3.5 py-1.5 rounded-full border border-[#39C5BB]/50 text-[#39C5BB] font-mono text-[10px] tracking-[0.15em] uppercase hover:bg-[#39C5BB]/10 disabled:opacity-50 transition-colors">
            {uploading ? '上传中…' : '换头像'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
          <input className={inputCls} value={draft.avatar} onChange={e => set('avatar', e.target.value)} placeholder="或直接填图片地址" />
        </div>
      </div>

      <Field label="名字"><input className={inputCls} value={draft.name} onChange={e => set('name', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="身份"><input className={inputCls} value={draft.role} onChange={e => set('role', e.target.value)} placeholder="Full-Stack Craftsman" /></Field>
        <Field label="所属"><input className={inputCls} value={draft.affiliation} onChange={e => set('affiliation', e.target.value)} placeholder="CS @ USYD" /></Field>
      </div>
      <Field label="地点"><input className={inputCls} value={draft.location} onChange={e => set('location', e.target.value)} placeholder="Sydney" /></Field>
      <Field label="签名"><textarea className={`${inputCls} resize-none`} rows={2} value={draft.quote} onChange={e => set('quote', e.target.value)} /></Field>
      <Field label="自我介绍"><textarea className={`${inputCls} resize-y`} rows={4} value={draft.bio} onChange={e => set('bio', e.target.value)} /></Field>

      {/* Now */}
      <div>
        <span className={labelCls}>Now · 最近在做</span>
        <div className="flex flex-col gap-2">
          {draft.now.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input className={keyCls} value={item.k} placeholder="Building" onChange={e => set('now', draft.now.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} />
              <input className={valCls} value={item.v} placeholder="在做的事" onChange={e => set('now', draft.now.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} />
              <button type="button" className={`${smallBtn} shrink-0 px-1`} onClick={() => set('now', draft.now.filter((_, j) => j !== i))} aria-label="删除">✕</button>
            </div>
          ))}
          <button type="button" className={`${smallBtn} self-start`} onClick={() => set('now', [...draft.now, { k: '', v: '' }])}>+ 加一行</button>
        </div>
      </div>

      {/* Interests */}
      <div>
        <span className={labelCls}>Interests · 兴趣</span>
        <div className="flex flex-col gap-2">
          {draft.interests.map((item, i) => (
            <div key={i} className="flex gap-2">
              <input className={keyCls} value={item.tag} placeholder="标签" onChange={e => set('interests', draft.interests.map((x, j) => j === i ? { ...x, tag: e.target.value } : x))} />
              <input className={valCls} value={item.note} placeholder="一句话注解" onChange={e => set('interests', draft.interests.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
              <button type="button" className={`${smallBtn} shrink-0 px-1`} onClick={() => set('interests', draft.interests.filter((_, j) => j !== i))} aria-label="删除">✕</button>
            </div>
          ))}
          <button type="button" className={`${smallBtn} self-start`} onClick={() => set('interests', [...draft.interests, { tag: '', note: '' }])}>+ 加一个</button>
        </div>
      </div>

      <Field label="GitHub 链接"><input className={inputCls} value={draft.github} onChange={e => set('github', e.target.value)} placeholder="https://github.com/…（留空不显示）" /></Field>
      <Field label="邮箱"><input className={inputCls} value={draft.email} onChange={e => set('email', e.target.value)} placeholder="留空不显示" /></Field>
      <Field label="站点简介"><input className={inputCls} value={draft.siteDesc} onChange={e => set('siteDesc', e.target.value)} /></Field>

      {msg && <p className="text-xs text-rose-400 leading-relaxed">{msg}</p>}

      <div className="flex items-center justify-end gap-5 pt-2">
        <button type="button" className={smallBtn} onClick={onDone} disabled={saving}>取消</button>
        <button type="button" onClick={onSave} disabled={saving || uploading}
          className="px-5 py-2 rounded-full bg-[#39C5BB] text-white font-mono text-[10px] tracking-[0.2em] uppercase hover:bg-[#2fb3a9] disabled:opacity-50 transition-colors">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );
};
