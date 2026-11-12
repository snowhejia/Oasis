import { describe, it, expect } from 'vitest';
import { hasLossySyntax, unescapeOasis, toBody } from './richMarkdown';

describe('richMarkdown', () => {
  it('还原双链转义、压掉多余空行', () => {
    expect(unescapeOasis('见 \\[\\[数字花园\\]\\]\n\n\n\n下一段  \n')).toBe('见 [[数字花园]]\n\n下一段\n');
  });
  it('识别会丢失的写法：HTML 与脚注，代码里的不算', () => {
    expect(hasLossySyntax('正文<span>红</span>')).toBe(true);
    expect(hasLossySyntax('正文[^1]\n\n[^1]: 注')).toBe(true);
    expect(hasLossySyntax('正文 `<div>` 与\n```html\n<p>x</p>\n```')).toBe(false);
    expect(hasLossySyntax('2 < 3 而 a<b')).toBe(false);
  });
  it('toBody 去掉封面定义行', () => {
    expect(toBody('正文\n\n[oasis-cover]: https://x/y.jpg\n')).not.toContain('oasis-cover');
  });
});
