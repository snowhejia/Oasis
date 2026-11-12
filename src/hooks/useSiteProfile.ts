// src/hooks/useSiteProfile.ts
// 🪪 站主档案：Supabase `site_profile` 表（单行 id='main'）为权威源 + localStorage 缓存兜底，与 useGarden 同一套路。
//   · 全站共用一份模块级状态（首页左栏、档案弹窗、入场页称呼、尺牍名帖都读它），保存后各处同步刷新。
//   · 表未建 / 没配 Supabase：读写都静默落在本机缓存，行为不坏。
//   · 头像上传到 Storage 公开桶 `site-assets`，档案里只存公开地址。
import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';

export interface ProfileNowItem { k: string; v: string }
export interface ProfileInterest { tag: string; note: string }

export interface SiteProfile {
  name: string;         // 名字：首页大标题、档案弹窗、入场页称呼
  role: string;         // 身份行主体（初音绿那段）
  affiliation: string;  // 身份行后缀，如「CS @ USYD」
  location: string;     // 档案弹窗里跟在 affiliation 后的地点
  quote: string;        // 签名引言
  bio: string;          // 档案弹窗正文
  now: ProfileNowItem[];
  interests: ProfileInterest[];
  github: string;       // 完整链接，留空不显示
  email: string;        // 留空不显示
  avatar: string;       // 头像地址；默认 /avatar.jpg
  siteDesc: string;     // 一句话站点简介（尺牍名帖、网页描述）
}

export const DEFAULT_PROFILE: SiteProfile = {
  name: 'Gardener',
  role: 'Full-Stack Craftsman',
  affiliation: '',
  location: '',
  quote: 'Exploring the intersection of human behavior, aesthetics & software architecture.',
  bio: '',
  now: [],
  interests: [],
  github: '',
  email: '',
  avatar: '/avatar.jpg',
  siteDesc: '一处温柔疗愈、带着禅意的数字花园。',
};

const TABLE = 'site_profile';
const ROW_ID = 'main';
const BUCKET = 'site-assets';
const CACHE_KEY = 'oasis_site_profile';

const normalize = (raw: unknown): SiteProfile => {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiteProfile>;
  const str = (v: unknown, fb: string) => (typeof v === 'string' ? v : fb);
  return {
    name: str(d.name, DEFAULT_PROFILE.name) || DEFAULT_PROFILE.name,
    role: str(d.role, DEFAULT_PROFILE.role),
    affiliation: str(d.affiliation, DEFAULT_PROFILE.affiliation),
    location: str(d.location, DEFAULT_PROFILE.location),
    quote: str(d.quote, DEFAULT_PROFILE.quote),
    bio: str(d.bio, DEFAULT_PROFILE.bio),
    now: Array.isArray(d.now) ? d.now.filter(x => x && typeof x.k === 'string').map(x => ({ k: x.k, v: String(x.v ?? '') })) : [],
    interests: Array.isArray(d.interests) ? d.interests.filter(x => x && typeof x.tag === 'string').map(x => ({ tag: x.tag, note: String(x.note ?? '') })) : [],
    github: str(d.github, DEFAULT_PROFILE.github),
    email: str(d.email, DEFAULT_PROFILE.email),
    avatar: str(d.avatar, DEFAULT_PROFILE.avatar) || DEFAULT_PROFILE.avatar,
    siteDesc: str(d.siteDesc, DEFAULT_PROFILE.siteDesc) || DEFAULT_PROFILE.siteDesc,
  };
};

const readCache = (): SiteProfile => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalize(JSON.parse(raw)) : DEFAULT_PROFILE;
  } catch { return DEFAULT_PROFILE; }
};
const writeCache = (p: SiteProfile) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(p)); } catch { /* 存储满或被禁用：只是没缓存 */ } };

// ── 模块级单例 ────────────────────────────────────────────────
let current: SiteProfile = readCache();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(fn => fn());
const setCurrent = (p: SiteProfile) => { current = p; writeCache(p); applyDocumentMeta(p); emit(); };

const applyDocumentMeta = (p: SiteProfile) => {
  if (typeof document === 'undefined') return;
  document.title = `Oasis · ${p.name} 的小站`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', p.siteDesc);
  document.querySelector('meta[name="author"]')?.setAttribute('content', p.name);
};
applyDocumentMeta(current);

let fetched = false;
const fetchRemote = async () => {
  if (fetched) return;
  fetched = true;
  try {
    const { data, error } = await supabase.from(TABLE).select('data').eq('id', ROW_ID).maybeSingle();
    if (error) throw error;
    if (data?.data) setCurrent(normalize(data.data));
  } catch {
    // 表未建 / 离线：继续用缓存
  }
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  void fetchRemote();
  return () => { listeners.delete(fn); };
};
const getSnapshot = () => current;

/** 保存整份档案。云端失败会抛错（让表单提示），但本机缓存仍会更新。 */
export const saveSiteProfile = async (next: SiteProfile) => {
  const clean = normalize(next);
  setCurrent(clean);
  const { error } = await supabase.from(TABLE).upsert({ id: ROW_ID, data: clean, updated_at: new Date().toISOString() });
  if (error) throw error;
};

/** 上传头像到 Storage，返回公开地址（不自动保存档案，由表单统一保存）。 */
export const uploadAvatar = async (file: File): Promise<string> => {
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `avatar/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: '31536000', upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

export const getSiteProfile = () => current;

export const useSiteProfile = (): SiteProfile => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
