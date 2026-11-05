import { describe, expect, it } from 'vitest'
import { base64ToBytes, base64ToText, bytesToBase64, bytesToBase64Url, textToBase64 } from './base64.ts'

describe('base64', () => {
  it('round-trips UTF-8 text, including emoji and other multi-byte characters', () => {
    const text = '🔴 high · 🟡 med · 🟢 low · 🎯 ✅ 🔄 ❌ — Week of 2 Nov 2026 — café\n'
    expect(base64ToText(textToBase64(text))).toBe(text)
  })

  it('ignores the line breaks GitHub puts in blob content', () => {
    const encoded = textToBase64('x'.repeat(200)).replace(/.{60}/g, '$&\n')
    expect(base64ToText(encoded)).toBe('x'.repeat(200))
  })

  it('refuses bytes that are not UTF-8 instead of guessing', () => {
    expect(() => base64ToText(bytesToBase64(new Uint8Array([0xff, 0xfe])))).toThrow()
  })

  it('handles large inputs and base64url', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
    expect(bytesToBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8')
  })
})
