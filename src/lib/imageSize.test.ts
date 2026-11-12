import { describe, it, expect } from 'vitest';
import { parseImageAlt, withImageWidth } from './imageSize';

describe('imageSize', () => {
  it('解析 alt 末尾的宽度', () => {
    expect(parseImageAlt('合照|50')).toEqual({ alt: '合照', width: 50 });
    expect(parseImageAlt('合照')).toEqual({ alt: '合照', width: null });
    expect(parseImageAlt('|5').width).toBe(10);
    expect(parseImageAlt(undefined)).toEqual({ alt: '', width: null });
  });
  it('写回宽度、清掉宽度', () => {
    expect(withImageWidth('合照|50', 75)).toBe('合照|75');
    expect(withImageWidth('合照|50', null)).toBe('合照');
  });
});
