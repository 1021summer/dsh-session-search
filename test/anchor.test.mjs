/**
 * 锚点（anchorKey）生成与解析测试 —— 定位功能的核心。
 *
 * 背景：搜索结果靠 anchorKey 精确定位到 DOM 消息行，
 * 而不是靠关键词「找第一条包含它的消息」（那会在同一会话出现相同关键词时跳错）。
 * 因此 anchorKey 的生成规则必须与 DSH 的 data-chat-anchor-key 完全一致。
 *
 * 运行：node --test
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assistantAnchorKey,
  inputAnchorKey,
  parseHistory,
} from '../lib/index.js'

/** 构造一行 JSONL 事件。 */
function ev(type, seq, time, data) {
  return JSON.stringify({ type, seq, time, data })
}

test('inputAnchorKey：规则为 `${kind.length}:${kind}${id}`', () => {
  // "input-message".length === 13
  assert.equal(inputAnchorKey('abc'), '13:input-messageabc')
  assert.equal(inputAnchorKey('ae4902f0-4163-4899-a76c-1c78dc829433'),
    '13:input-messageae4902f0-4163-4899-a76c-1c78dc829433')
})

test('assistantAnchorKey：规则为 `${kind.length}:${kind}${turn}:${step}`', () => {
  // "assistant-step".length === 14
  assert.equal(assistantAnchorKey(1, 2), '14:assistant-step1:2')
  assert.equal(assistantAnchorKey(0, 0), '14:assistant-step0:0')
})

test('parseHistory：user 消息用 data.id 生成 input-message 锚点', () => {
  const text = [
    ev('user/message', 7, 1000, { id: 'u-1', source: { kind: 'user' }, content: 'hello world' }),
  ].join('\n')
  const { msgs } = parseHistory(text)
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].role, 'user')
  assert.equal(msgs[0].anchorKey, '13:input-messageu-1')
})

test('parseHistory：非 user 来源（plugin/skill-catalog）不生成 input-message 锚点', () => {
  // DSH 中这些会落为 context 节点，锚点格式不同 —— 必须不产出，否则会定位到错误的行
  const text = [
    ev('user/message', 8, 1001, { id: 'p-1', source: { kind: 'plugin' }, content: 'injected notice' }),
    ev('user/message', 9, 1002, { id: 's-1', source: { kind: 'skill-catalog' }, content: 'skill list' }),
  ].join('\n')
  const { msgs } = parseHistory(text)
  assert.equal(msgs.length, 2)
  for (const m of msgs) {
    assert.equal(m.anchorKey, null, '非 user 来源不应有 input-message 锚点')
  }
})

test('parseHistory：assistant 消息用 turn:step 生成 assistant-step 锚点', () => {
  const text = [
    ev('assistant/message', 224, 2000, { turn: 1, step: 1, message: { content: 'Hi there' } }),
    ev('assistant/message', 501, 3000, { turn: 1, step: 2, message: { content: 'Again Hello' } }),
  ].join('\n')
  const { msgs } = parseHistory(text)
  assert.equal(msgs.length, 2)
  // 已按时间倒序：step2 在前
  assert.equal(msgs[0].anchorKey, '14:assistant-step1:2')
  assert.equal(msgs[1].anchorKey, '14:assistant-step1:1')
})

test('parseHistory：同一会话出现相同关键词时，各条锚点互不相同（定位一一对应）', () => {
  // 这是「点三条结果分别定位到三条消息」的前提
  const text = [
    ev('user/message', 1, 1000, { id: 'a', source: { kind: 'user' }, content: 'hello 111' }),
    ev('assistant/message', 2, 2000, { turn: 1, step: 1, message: { content: 'hello 222' } }),
    ev('user/message', 3, 3000, { id: 'b', source: { kind: 'user' }, content: 'hello 333' }),
  ].join('\n')
  const { msgs } = parseHistory(text)
  const keys = msgs.map((m) => m.anchorKey)
  assert.equal(new Set(keys).size, keys.length, '锚点必须唯一，否则无法区分消息')
  assert.ok(keys.every((k) => typeof k === 'string' && k.length > 0))
})

test('parseHistory：缺 turn/step 的 assistant 事件不生成锚点', () => {
  const text = ev('assistant/message', 5, 1000, { message: { content: 'no turn/step' } })
  const { msgs } = parseHistory(text)
  assert.equal(msgs[0].anchorKey, null)
})

test('parseHistory：标题与角色解析正常', () => {
  const text = [
    ev('session/title', 1, 100, { title: '我的会话' }),
    ev('user/message', 2, 200, { id: 'x', source: { kind: 'user' }, content: '问题' }),
    ev('assistant/message', 3, 300, { turn: 1, step: 1, message: { content: '回答' } }),
  ].join('\n')
  const { title, msgs } = parseHistory(text)
  assert.equal(title, '我的会话')
  assert.deepEqual(msgs.map((m) => m.role).sort(), ['ds', 'user'])
})

test('parseHistory：坏行不影响其余事件', () => {
  const text = ['{ not json', ev('user/message', 1, 1000, { id: 'ok', source: { kind: 'user' }, content: 'fine' })].join('\n')
  const { msgs } = parseHistory(text)
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].anchorKey, '13:input-messageok')
})
