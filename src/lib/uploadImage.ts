// src/lib/uploadImage.ts
// 🖼️ 文章配图上传（线上可用）：浏览器里先缩到长边 ≤ 2400、转 webp，再传到 Supabase Storage 公开桶 site-assets/posts/。
//   桶与写入权限由 supabase/site_profile.sql 建好（只有 is_gardener() 能传）。
//   gif / svg 原样上传（动图、矢量一压就坏）；转码失败也原样上传。
//   开发环境里写作抽屉还有一条 /__upload/image → R2 的老路（CoverPicker），两者互不影响。
import { supabase } from './supabase';

const BUCKET = 'site-assets';
const MAX_EDGE = 2400;
const MAX_BYTES = 15 * 1024 * 1024;

const toWebp = async (file: File): Promise<Blob | null> => {
  if (!/^image\/(png|jpe?g|webp|bmp|avif)$/i.test(file.type)) return null;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', 0.86));
    // 没变小（已经是很省的图）就用原图
    return blob && blob.size < file.size ? blob : null;
  } catch { return null; }
};

const rand = () => Math.random().toString(36).slice(2, 8);

/** 上传一张文章配图，返回公开地址。失败抛出带中文说明的错误。 */
export const uploadPostImage = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) throw new Error('只能上传图片');
  if (file.size > MAX_BYTES) throw new Error('图片超过 15 MB');
  const webp = await toWebp(file);
  const body: Blob = webp ?? file;
  const ext = webp ? 'webp' : ((file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png');
  const d = new Date();
  const path = `posts/${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}/${Date.now()}-${rand()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, {
    cacheControl: '31536000',
    contentType: webp ? 'image/webp' : (file.type || undefined),
    upsert: false,
  });
  if (error) {
    const hint = /bucket not found/i.test(error.message) ? '（还没在 Supabase 跑 site_profile.sql？）'
      : /row-level security|unauthorized|403/i.test(error.message) ? '（没登录，或登录邮箱不是站主邮箱）' : '';
    throw new Error(`图片上传失败：${error.message}${hint}`);
  }
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
};

/** 从剪贴板 / 拖拽数据里取出图片文件 */
export const imageFilesOf = (dt: DataTransfer | null): File[] =>
  dt ? Array.from(dt.files).filter(f => f.type.startsWith('image/')) : [];
