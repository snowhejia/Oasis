// src/lib/richMarkdown.ts
// ✍️ 所见即所得写作台（garden/RichEditor.tsx）与库里 Markdown 之间的小转换，单独成文件好测。
import { stripCoverDef } from './coverImage';

/** 可视编辑会丢失的写法：原始 HTML 标签、脚注 */
export const hasLossySyntax = (md: string) => {
  const body = stripCoverDef(md).replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  return /<\/?[a-zA-Z][\w-]*(\s[^>]*)?>/.test(body) || /\[\^[^\]\s]+\]/.test(body);
};

export const unescapeOasis = (md: string) =>
  md
    .replace(/\\\[\\\[([^\n]*?)\\\]\\\]/g, '[[$1]]') // 双链
    .replace(/\n{3,}/g, '\n\n')                       // 表格前后多出的空行
    .replace(/\s+$/, '') + '\n';

export const toBody = (md: string) => stripCoverDef(md).replace(/\s+$/, '');
