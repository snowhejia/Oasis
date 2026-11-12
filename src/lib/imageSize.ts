// src/lib/imageSize.ts
// 📐 文章配图的显示宽度：沿用 Obsidian 的写法，写在 alt 末尾 `![说明|50](url)`，数字是占正文宽度的百分比。
//   不写就是「自适应」：宽度至多铺满正文，高度至多六成屏高（竖拍的照片不会一张占满好几屏）。
//   阅读舱（Markdown.tsx）与所见即所得写作台（garden/RichEditor.tsx）共用这一处解析。

export const IMAGE_SIZES = [25, 50, 75, 100] as const;

const SIZE_RE = /\s*\|\s*(\d{1,3})\s*$/;

export const parseImageAlt = (alt: string | undefined | null): { alt: string; width: number | null } => {
  const raw = alt ?? '';
  const m = raw.match(SIZE_RE);
  if (!m) return { alt: raw, width: null };
  const n = Math.min(100, Math.max(10, Number(m[1])));
  return { alt: raw.replace(SIZE_RE, ''), width: n };
};

export const withImageWidth = (alt: string | undefined | null, width: number | null) => {
  const base = parseImageAlt(alt).alt;
  return width ? `${base}|${width}` : base;
};

/** 图片的内联样式：有宽度按百分比；没有就限高自适应 */
export const imageSizeStyle = (width: number | null): Record<string, string> =>
  width
    ? { width: `${width}%`, height: 'auto' }
    : { width: 'auto', maxWidth: '100%', height: 'auto', maxHeight: '60vh' };
