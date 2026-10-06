/**
 * dsh-session-search 主机端纯函数测试。
 *
 * 运行：node --test test/
 * 覆盖：Host 解析（含 IPv6）、回环判定、命中片段截断。
 * 这些用例直接对应公开前的审查项（IPv6 回环 bug、响应规模限制）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  hostnameOf,
  isLoopbackAddress,
  isLoopbackHostname,
  snippetOf,
} from '../lib/index.js'

test('hostnameOf：IPv4 与端口', () => {
  assert.equal(hostnameOf('127.0.0.1:3080'), '127.0.0.1')
  assert.equal(hostnameOf('localhost:3080'), 'localhost')
})

test('hostnameOf：IPv6 形式不再被 split(":") 切坏', () => {
  // 回归用例：旧实现 split(':')[0] 会把 `[::1]:3080` 切成 `[`
  assert.equal(hostnameOf('[::1]:3080'), '[::1]')
  assert.equal(hostnameOf('[::1]'), '[::1]')
  // URL 会规范化 IPv6 展开写法（0:0:0:0:0:0:0:1 → ::1），更利于回环判定
  assert.equal(hostnameOf('[0:0:0:0:0:0:0:1]:3080'), '[::1]')
})

test('hostnameOf：非法输入返回空串', () => {
  assert.equal(hostnameOf(''), '')
  assert.equal(hostnameOf(undefined), '')
  assert.equal(hostnameOf('http://[bad'), '')
})

test('isLoopbackHostname：接受各类回环写法', () => {
  assert.equal(isLoopbackHostname('localhost'), true)
  assert.equal(isLoopbackHostname('127.0.0.1'), true)
  assert.equal(isLoopbackHostname('127.9.9.9'), true)
  assert.equal(isLoopbackHostname('::1'), true)
  assert.equal(isLoopbackHostname('[::1]'), true)
  assert.equal(isLoopbackHostname('0:0:0:0:0:0:0:1'), true)
})

test('isLoopbackHostname：拒绝非回环', () => {
  assert.equal(isLoopbackHostname('example.com'), false)
  assert.equal(isLoopbackHostname('10.0.0.1'), false)
  assert.equal(isLoopbackHostname('192.168.1.1'), false)
  assert.equal(isLoopbackHostname('128.0.0.1'), false)
  assert.equal(isLoopbackHostname('localhost.evil.com'), false)
  assert.equal(isLoopbackHostname('[::2]'), false)
  assert.equal(isLoopbackHostname('127.0.0.256'), false)
  assert.equal(isLoopbackHostname(''), false)
})

test('isLoopbackAddress：含 IPv4-mapped IPv6', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:8.8.8.8'), false)
  assert.equal(isLoopbackAddress(''), false)
  assert.equal(isLoopbackAddress(undefined), false)
})

test('snippetOf：短文本原样返回', () => {
  const r = snippetOf('hello world', 'world')
  assert.equal(r.text, 'hello world')
  assert.equal(r.truncated, false)
})

test('snippetOf：长文本截断且命中词居中', () => {
  const long = 'x'.repeat(500) + 'NEEDLE' + 'y'.repeat(500)
  const r = snippetOf(long, 'needle')
  assert.equal(r.truncated, true)
  assert.ok(r.text.length <= 302, `片段长度应受限，实际 ${r.text.length}`)
  assert.ok(r.text.includes('NEEDLE'), '片段应包含命中词')
})

test('snippetOf：无命中词时取开头并标记截断', () => {
  const long = 'a'.repeat(600)
  const r = snippetOf(long, 'zzz')
  assert.equal(r.truncated, true)
  assert.ok(r.text.startsWith('a'))
  assert.ok(r.text.length <= 300)
})

test('snippetOf：非字符串输入不抛错', () => {
  assert.equal(snippetOf(null, 'x').text, '')
  assert.equal(snippetOf(undefined, 'x').truncated, false)
})
