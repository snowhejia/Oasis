// src/components/garden/RichEditor.tsx
// ✍️ 所见即所得写作（Tiptap 3 + @tiptap/markdown）：库里存的仍是 Markdown，这里只是另一种写法。
//   · 读：去掉正文末尾的封面定义行 `[oasis-cover]: …`（Markdown 解析器会把它当引用定义吞掉）再载入；
//     写：getMarkdown() 之后把 `\[\[双链\]\]` 的转义还原，再把原来的封面定义行接回去。
//   · 只在用户真的动了笔才回传 onChange：打开旧文章看一眼不会把它改写一遍。
//   · 原始 HTML、脚注在这里会丢，含有它们的文章顶上给提示，一键切回 Markdown 源码。
//   · 图片：工具栏选图 / 粘贴 / 拖进来，都先传到 Supabase Storage（lib/uploadImage.ts）再插入。
//   单独成 chunk，由 OasisGallery 懒加载，不进阅读页。
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { readCoverChoice, writeCoverChoice } from '../../lib/coverImage';
import { hasLossySyntax, unescapeOasis, toBody } from '../../lib/richMarkdown';
import { uploadPostImage, imageFilesOf } from '../../lib/uploadImage';
import { IMAGE_SIZES, parseImageAlt, withImageWidth, imageSizeStyle } from '../../lib/imageSize';

// 图片宽度存在 alt 末尾（`说明|50`），编辑器里按它画出同样的大小，和阅读舱一致
const SizedImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    const { alt, width } = parseImageAlt(HTMLAttributes.alt as string | undefined);
    const style = Object.entries(imageSizeStyle(width)).map(([k, v]) => `${k.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}:${v}`).join(';');
    return ['img', mergeAttributes(HTMLAttributes, { alt, style })];
  },
});
const SIZE_LABEL: Record<number, string> = { 25: '小', 50: '中', 75: '大', 100: '满' };

interface Props {
  value: string;
  onChange: (md: string) => void;
  onSubmit?: () => void;        // ⌘/Ctrl + Enter
  onRequestSource?: () => void; // 切回 Markdown 源码
  className?: string;           // 正文排版类（与阅读舱同一套 prose）
  hideToolbar?: boolean;        // Zen
}

const Btn: React.FC<{ on?: boolean; title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }> = ({ on, title, onClick, disabled, children }) => (
  <button type="button" title={title} disabled={disabled} onMouseDown={e => e.preventDefault()} onClick={onClick}
    className={`min-w-[28px] h-7 px-2 flex items-center justify-center font-mono text-[11px] rounded-md transition-colors disabled:opacity-30 ${on ? 'bg-[#39C5BB]/15 text-[#39C5BB]' : 'text-slate-500 dark:text-slate-400 hover:bg-[#39C5BB]/10 hover:text-[#39C5BB]'}`}>
    {children}
  </button>
);
const Sep = () => <span className="w-px h-4 mx-1 bg-slate-200 dark:bg-white/10" aria-hidden />;

export const RichEditor: React.FC<Props> = ({ value, onChange, onSubmit, onRequestSource, className, hideToolbar }) => {
  const lastEmitted = useRef<string>(value);
  // 编辑器的回调只在创建时取一次，最新的 props 经这几个 ref 读（在 layout effect 里同步，不在渲染期写 ref）
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const [lossy] = useState(() => hasLossySyntax(value));
  const fileRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const uploadAndInsert = async (files: File[], pos?: number) => {
    const ed = editorRef.current;
    if (!ed || !files.length) return;
    setError('');
    setUploading(n => n + files.length);
    let at = pos;
    for (const file of files) {
      try {
        const src = await uploadPostImage(file);
        const alt = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
        const chain = ed.chain().focus();
        (at != null ? chain.insertContentAt(at, { type: 'image', attrs: { src, alt } }) : chain.setImage({ src, alt })).run();
        at = undefined; // 多张图依次接在后面
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(n => n - 1);
      }
    }
  };
  const uploadRef = useRef(uploadAndInsert);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer' } },
      }),
      Markdown,
      SizedImage.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Let your thoughts flow…' }),
    ],
    content: toBody(value),
    contentType: 'markdown',
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: `oasis-rich outline-none min-h-[60vh] pb-[30vh] ${className ?? ''}`, spellcheck: 'false' },
      handleKeyDown: (_view, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSubmitRef.current?.(); return true; }
        return false;
      },
      handlePaste: (_view, e) => {
        const files = imageFilesOf(e.clipboardData);
        if (!files.length) return false;
        e.preventDefault();
        void uploadRef.current(files);
        return true;
      },
      handleDrop: (view, e, _slice, moved) => {
        if (moved) return false;
        const files = imageFilesOf(e.dataTransfer);
        if (!files.length) return false;
        e.preventDefault();
        const pos = view.posAtCoords({ left: e.clientX, top: e.clientY })?.pos;
        void uploadRef.current(files, pos);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const body = unescapeOasis(ed.isEmpty ? '' : ed.getMarkdown());
      const next = writeCoverChoice(body, readCoverChoice(valueRef.current));
      lastEmitted.current = next;
      onChangeRef.current(next);
    },
  });
  useLayoutEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    onSubmitRef.current = onSubmit;
    uploadRef.current = uploadAndInsert;
    editorRef.current = editor;
  });

  // 外部改了正文（插模板、恢复草稿、封面抽屉写封面行）：重新载入，但不回传
  useEffect(() => {
    if (!editor || value === lastEmitted.current) return;
    lastEmitted.current = value;
    // 只动了封面行：正文没变就别重载（会丢光标）
    if (toBody(value) === toBody(unescapeOasis(editor.isEmpty ? '' : editor.getMarkdown()))) return;
    editor.commands.setContent(toBody(value), { contentType: 'markdown', emitUpdate: false });
  }, [value, editor]);

  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed ? {
      bold: ed.isActive('bold'), italic: ed.isActive('italic'), strike: ed.isActive('strike'), code: ed.isActive('code'),
      h2: ed.isActive('heading', { level: 2 }), h3: ed.isActive('heading', { level: 3 }),
      quote: ed.isActive('blockquote'), bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'), task: ed.isActive('taskList'),
      codeBlock: ed.isActive('codeBlock'), link: ed.isActive('link'), table: ed.isActive('table'),
      canUndo: ed.can().undo(), canRedo: ed.can().redo(),
      imageWidth: ed.isActive('image') ? parseImageAlt(ed.getAttributes('image').alt).width : null,
    } : null,
  });

  if (!editor) return null;
  const c = () => editor.chain().focus();

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('链接地址（留空取消链接）', prev ?? 'https://');
    if (url === null) return;
    if (!url.trim() || url.trim() === 'https://') { c().extendMarkRange('link').unsetLink().run(); return; }
    if (editor.state.selection.empty && !prev) {
      c().insertContent({ type: 'text', text: url.trim(), marks: [{ type: 'link', attrs: { href: url.trim() } }] }).run();
    } else {
      c().extendMarkRange('link').setLink({ href: url.trim() }).run();
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      {!hideToolbar && (
        <div className="shrink-0 flex flex-wrap items-center gap-0.5 mb-2 pb-2 border-b border-slate-200/60 dark:border-white/5">
          <Btn title="撤销 ⌘Z" onClick={() => c().undo().run()} disabled={!s?.canUndo}>↶</Btn>
          <Btn title="重做 ⇧⌘Z" onClick={() => c().redo().run()} disabled={!s?.canRedo}>↷</Btn>
          <Sep />
          <Btn title="二级标题" on={s?.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>H2</Btn>
          <Btn title="三级标题" on={s?.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>H3</Btn>
          <Sep />
          <Btn title="粗体 ⌘B" on={s?.bold} onClick={() => c().toggleBold().run()}><b>B</b></Btn>
          <Btn title="斜体 ⌘I" on={s?.italic} onClick={() => c().toggleItalic().run()}><i>i</i></Btn>
          <Btn title="删除线" on={s?.strike} onClick={() => c().toggleStrike().run()}><s>S</s></Btn>
          <Btn title="行内代码" on={s?.code} onClick={() => c().toggleCode().run()}>{'</>'}</Btn>
          <Btn title="链接" on={s?.link} onClick={setLink}>🔗</Btn>
          <Sep />
          <Btn title="引用" on={s?.quote} onClick={() => c().toggleBlockquote().run()}>❝</Btn>
          <Btn title="无序列表" on={s?.bullet} onClick={() => c().toggleBulletList().run()}>•</Btn>
          <Btn title="有序列表" on={s?.ordered} onClick={() => c().toggleOrderedList().run()}>1.</Btn>
          <Btn title="任务" on={s?.task} onClick={() => c().toggleTaskList().run()}>☑</Btn>
          <Btn title="代码块" on={s?.codeBlock} onClick={() => c().toggleCodeBlock().run()}>{'{ }'}</Btn>
          <Btn title="分割线" onClick={() => c().setHorizontalRule().run()}>—</Btn>
          <Btn title={s?.table ? '删除表格' : '插入表格'} on={s?.table}
            onClick={() => (s?.table ? c().deleteTable().run() : c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>▦</Btn>
          {s?.table && <>
            <Btn title="加一行" onClick={() => c().addRowAfter().run()}>+行</Btn>
            <Btn title="加一列" onClick={() => c().addColumnAfter().run()}>+列</Btn>
            <Btn title="删这行" onClick={() => c().deleteRow().run()}>−行</Btn>
            <Btn title="删这列" onClick={() => c().deleteColumn().run()}>−列</Btn>
          </>}
          <Sep />
          <Btn title="上传图片（也可以直接粘贴或拖进来）" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
            {uploading > 0 ? <span className="normal-case tracking-normal">上传中…</span> : '🖼'}
          </Btn>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { const files = Array.from(e.target.files ?? []); e.target.value = ''; void uploadAndInsert(files); }} />
          {onRequestSource && (
            <button type="button" onClick={onRequestSource} className="ml-auto font-mono text-[9px] tracking-widest uppercase text-slate-300 dark:text-slate-600 hover:text-[#39C5BB] transition-colors">
              所见即所得 · 切到 Markdown →
            </button>
          )}
        </div>
      )}
      {lossy && (
        <div className="shrink-0 mb-3 px-4 py-2.5 rounded-xl bg-[#FFB7C5]/15 border border-[#FFB7C5]/40 font-serif text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          这篇里有 HTML 或脚注，可视模式改动后它们会丢失。
          {onRequestSource && <button type="button" onClick={onRequestSource} className="ml-2 underline decoration-dotted text-[#39C5BB]">用 Markdown 编辑</button>}
        </div>
      )}
      {error && (
        <div className="shrink-0 mb-3 px-4 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-xs flex items-start gap-3">
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="关闭">✕</button>
        </div>
      )}
      {/* 选中图片时浮出：小 / 中 / 大 / 满 / 自适应 */}
      <BubbleMenu editor={editor} pluginKey="oasisImageSize" shouldShow={({ editor: ed }) => ed.isActive('image')}
        options={{ placement: 'top' }}
        className="flex items-center gap-0.5 p-1 rounded-full bg-white/95 dark:bg-[#111827]/95 border border-slate-200/80 dark:border-white/10 shadow-lg backdrop-blur-md">
        {IMAGE_SIZES.map(w => (
          <button key={w} type="button" onMouseDown={e => e.preventDefault()}
            onClick={() => c().updateAttributes('image', { alt: withImageWidth(editor.getAttributes('image').alt, w) }).run()}
            className={`px-3 h-7 rounded-full font-mono text-[11px] transition-colors ${s?.imageWidth === w ? 'bg-[#39C5BB] text-white' : 'text-slate-500 hover:text-[#39C5BB]'}`}>
            {SIZE_LABEL[w]}
          </button>
        ))}
        <button type="button" onMouseDown={e => e.preventDefault()}
          onClick={() => c().updateAttributes('image', { alt: withImageWidth(editor.getAttributes('image').alt, null) }).run()}
          className={`px-3 h-7 rounded-full font-mono text-[11px] transition-colors ${s && s.imageWidth == null ? 'bg-[#39C5BB] text-white' : 'text-slate-500 hover:text-[#39C5BB]'}`}>
          自适应
        </button>
        <span className="w-px h-4 mx-1 bg-slate-200 dark:bg-white/10" aria-hidden />
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => c().deleteSelection().run()}
          className="px-3 h-7 rounded-full font-mono text-[11px] text-slate-400 hover:text-rose-400 transition-colors">删除</button>
      </BubbleMenu>
      <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar" onClick={e => { if (e.target === e.currentTarget) editor.commands.focus('end'); }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichEditor;
