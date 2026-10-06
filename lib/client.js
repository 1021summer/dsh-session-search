/**
 * dsh-session-search - browser half.
 *
 * 搜索浮窗 UI。数据由主机端 /api/dsh-session-search 提供（读会话文件+全文搜索），
 * 浏览器端只负责：搜索框、对话方筛选、渲染「标题分组 + 每条 user/ds 消息 + 高亮」、
 * 点击进入对话、左上角关闭、搜索框内一键清除、无关键词时显示全部话题。
 *
 * 本 bundle 为手写纯 ES（无构建步骤）：React 经 require 种子词注入，
 * 样式以 <style> 注入，导出 cordis 客户端插件面（apply/inject）。
 * @module dsh-session-search/client
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-search',
  factory: (require) => {
    const React = require('react')
    const { useState, useEffect, useCallback, useRef, useSyncExternalStore } = React
    const h = React.createElement

    const NS = 'dsh-session-search'

    // ── 打开/关闭 共享 store ──
    let open = false
    const listeners = new Set()
    const overlayState = {
      getSnapshot: () => open,
      subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
      open: () => { open = true; listeners.forEach((f) => f()) },
      close: () => { open = false; listeners.forEach((f) => f()) },
    }
    function useOverlayOpen() {
      return useSyncExternalStore(overlayState.subscribe, overlayState.getSnapshot)
    }

    // ── 字典 ──
    const zh = {
      'dss.open': '搜索会话',
      'dss.placeholder': '搜索会话内容…',
      'dss.close': '关闭搜索',
      'dss.clear': '清除搜索',
      'dss.empty': '输入关键词，搜索你的历史会话',
      'dss.none': '没有找到匹配的会话',
      'dss.searching': '搜索中…',
      'dss.hits': '{n} 条命中',
      'dss.party.all': '全部',
      'dss.party.ds': 'DeepSeek',
      'dss.party.user': 'User',
      'dss.untitled': '未命名会话',
      'dss.error': '搜索失败：{msg}',
      'dss.nolocate': '这条消息无法精确定位（DSH 未给它生成锚点）',
      'dss.nolocateTag': '不可定位',
    }
    const en = {
      'dss.open': 'Search sessions',
      'dss.placeholder': 'Search sessions…',
      'dss.close': 'Close search',
      'dss.clear': 'Clear search',
      'dss.empty': 'Type a keyword to search your history',
      'dss.none': 'No matching sessions',
      'dss.searching': 'Searching…',
      'dss.hits': '{n} hits',
      'dss.party.all': 'All',
      'dss.party.ds': 'DeepSeek',
      'dss.party.user': 'User',
      'dss.untitled': 'Untitled session',
      'dss.error': 'Search failed: {msg}',
      'dss.nolocate': 'This message has no anchor and cannot be located precisely',
      'dss.nolocateTag': 'not locatable',
    }
    const dicts = { zh, en }

    // ── 样式 ──
    const CSS = `
.dss-entry-btn { display:inline-flex; align-items:center; gap:4px; color:#737a82; cursor:pointer; padding:6px; border-radius:8px; transition:background .15s,color .15s; }
.dss-entry-btn:hover { background:#f0f2f5; color:#1a1d21; }
.dss-entry-btn svg { width:16px; height:16px; }
.dss-ov { position:fixed; inset:0; z-index:9999; display:flex; align-items:flex-start; justify-content:center; background:rgba(0,0,0,.32); padding-top:6vh; }
.dss-card { width:min(680px,94vw); max-height:90vh; display:flex; flex-direction:column; background:#fff; border-radius:16px; box-shadow:0 16px 60px rgba(0,0,0,.28); overflow:hidden; }
.dss-head { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid #e4e7ec; }
.dss-close { flex:0 0 auto; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#737a82; cursor:pointer; font-size:18px; line-height:1; }
.dss-close:hover { background:#f0f2f5; color:#1a1d21; }
.dss-field { flex:1; display:flex; align-items:center; gap:8px; border:1px solid #e4e7ec; border-radius:10px; padding:8px 12px; background:#f7f8fa; }
.dss-field svg { width:15px; height:15px; color:#9aa2ab; flex:0 0 auto; }
.dss-field input { border:none; outline:none; font-size:14px; width:100%; background:transparent; color:#1a1d21; }
.dss-field input::placeholder { color:#9aa2ab; }
.dss-clear { flex:0 0 auto; width:20px; height:20px; line-height:20px; text-align:center; border-radius:50%; background:#e4e7ec; color:#737a82; cursor:pointer; font-size:12px; }
.dss-clear:hover { background:#d5dae1; color:#1a1d21; }
.dss-party { display:flex; gap:8px; padding:10px 14px 2px; }
.dss-party .chip { padding:5px 12px; border-radius:999px; font-size:13px; background:#fff; border:1px solid #e4e7ec; cursor:pointer; color:#737a82; font-weight:500; }
.dss-party .chip.on { background:#e8f0fe; border-color:#1b74e4; color:#1b74e4; font-weight:600; }
.dss-body { flex:1; overflow-y:auto; padding:10px 8px; }
.dss-hint { padding:24px; text-align:center; color:#9aa2ab; font-size:13px; }
.dss-item { display:block; width:100%; text-align:left; text-decoration:none; padding:12px 14px; cursor:pointer; border-radius:10px; background:#fff; }
.dss-item:hover { background:#f0f4fb; }
/* 无锚点（不可精确定位）的条目：弱化并禁止指针，避免用户误以为可跳转 */
.dss-item-nolocate { opacity:.62; cursor:default; }
.dss-item-nolocate:hover { background:#fff; }
.dss-item-title { font-size:14px; font-weight:600; color:#1a1d21; display:flex; align-items:center; gap:6px; }
.dss-item-title .who { font-size:10px; padding:1px 6px; border-radius:5px; background:#e8f0fe; color:#1b74e4; font-weight:600; flex:0 0 auto; }
.dss-item-title .who.user { background:#fef3e2; color:#c0761a; }
.dss-item-text { font-size:12px; color:#737a82; margin-top:4px; line-height:1.5; }
mark { background:#ffe08a; color:inherit; font-weight:600; border-radius:2px; padding:0 1px; }
.dss-label { padding:8px 14px; font-weight:500; color:#9aa2ab; font-size:12px; }
`

    // ── 高亮关键词 ──
    function hl(text, q) {
      const html = esc(text)
      if (!q) return html
      const re = new RegExp('(' + escRegex(esc(q)) + ')', 'gi')
      return html.replace(re, '<mark>$1</mark>')
    }
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
    function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

    // ── 调主机端搜索端点 ──
    const API = '/api/dsh-session-search'
    /**
     * @param {string} query - 用户输入的关键词。
     * @param {string} party - 对话方过滤。
     * @returns {Promise<{ groups: Array, query: string }>} groups + 服务端规范化后的查询串。
     */
    async function apiSearch(query, party) {
      const url = API + '?q=' + encodeURIComponent(query) + '&party=' + encodeURIComponent(party)
      const res = await fetch(url)
      const data = await res.json().catch(() => ({}))
      if (!data.ok) throw new Error(data.error || 'request failed')
      // 高亮必须用服务端实际用来搜索的那个查询串（同一套截断/规范化规则）
      return { groups: data.groups || [], query: typeof data.query === 'string' ? data.query : String(query ?? '').trim() }
    }

    // ── 搜索浮窗 ──
    function SearchOverlay(props) {
      const t = props.t
      const isOpen = useOverlayOpen()

      const [q, setQ] = useState('')
      const [groups, setGroups] = useState(null)
      // 服务端规范化后的查询串：定位/高亮都用它，保证与搜索一致
      const [normQuery, setNormQuery] = useState('')
      const [party, setParty] = useState('all')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const timerRef = useRef(null)
      const inputRef = useRef(null)

      useEffect(() => { if (isOpen) { inputRef.current?.focus(); run('', party) } }, [isOpen])

      const close = useCallback(() => { overlayState.close(); setQ(''); setGroups(null); setErr(null); setBusy(false); setParty('all'); setNormQuery('') }, [])

      const run = useCallback(async (query, partySel) => {
        if (timerRef.current) clearTimeout(timerRef.current)
        const trimmed = query.trim()
        // 无关键词：也调端点，显示全部会话话题（leader 的 empty 分支）
        setBusy(true)
        timerRef.current = setTimeout(async () => {
          try {
            const r = await apiSearch(trimmed, partySel)
            setGroups(r.groups)
            setNormQuery(r.query)
            setErr(null)
          } catch (e) { setErr(e?.message || String(e)) } finally { setBusy(false) }
        }, 300)
      }, [])

      const onChange = (e) => { const v = e.target.value; setQ(v); run(v, party) }
      const onParty = (p) => { setParty(p); run(q, p) }
      const onKey = (e) => { if (e.key === 'Escape') close() }
      const clearQ = () => { setQ(''); setErr(null); setBusy(false); run('', party); inputRef.current?.focus() }

      if (!isOpen) return null

      const total = (groups || []).reduce((n, g) => n + (g.msgs?.length || 0), 0)

      // 时间戳 → "MM-DD HH:mm"
      function fmtTime(ms) {
        if (!ms) return ''
        const d = new Date(ms)
        if (isNaN(d)) return ''
        const p = (n) => String(n).padStart(2, '0')
        return p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
      }

      // 截断内容：有关键词 → 截到关键词句附近；无关键词 → 只取开头一句/短行
      function snippet(text, ql) {
        if (ql) {
          const idx = text.toLowerCase().indexOf(ql)
          const s = Math.max(0, idx - 40)
          const e = Math.min(text.length, idx + ql.length + 120)
          return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '')
        }
        // 无关键词：取第一句（按。！？换行切），最多 80 字
        const firstSentence = text.split(/[。！？\n]/)[0] || text
        return firstSentence.length > 80 ? firstSentence.slice(0, 80) + '…' : firstSentence
      }

      let body
      if (err) body = h('div', { className: 'dss-hint' }, t('dss.error', { msg: err }))
      else if (busy && groups === null) body = h('div', { className: 'dss-hint' }, t('dss.searching'))
      else if (groups && groups.length === 0) body = h('div', { className: 'dss-hint' }, t('dss.none'))
      else body = h('div', null,
        (groups && groups.length > 0) && h('div', { className: 'dss-label' }, t('dss.hits', { n: total })),
        (groups || []).map((g, gi) => {
          const msgs = (g.msgs || [])
          const label = h('div', { className: 'dss-label', style: { paddingTop: '14px', fontSize: '11px', fontWeight: 600, color: '#9aa2ab' } },
            (g.title || g.sessionId || t('dss.untitled')))
          const items = msgs.map((m, mi) => {
            // 无锚点的消息（DSH 中落为 context 节点的注入内容）无法精确定位
            const locatable = typeof m.anchorKey === 'string' && m.anchorKey.length > 0
            const head = h('div', { className: 'dss-item-title' },
              h('span', { className: 'who ' + (m.role === 'user' ? 'user' : '') }, m.role === 'user' ? t('dss.party.user') : t('dss.party.ds')),
              !locatable ? h('span', { style: { marginLeft: '6px', fontSize: '10px', color: '#c3c9d0' } }, t('dss.nolocateTag')) : null,
              m.time ? h('span', { style: { marginLeft: 'auto', fontSize: '11px', color: '#9aa2ab', fontWeight: 400 } }, fmtTime(m.time)) : null)
            const text = h('div', {
              className: 'dss-item-text',
              style: normQuery ? {} : { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
              dangerouslySetInnerHTML: { __html: hl(snippet(m.text, normQuery), normQuery) },
            })
            return h('a', {
              key: mi, href: '#',
              className: 'dss-item' + (locatable ? '' : ' dss-item-nolocate'),
              title: locatable ? '' : t('dss.nolocate'),
              onClick: (e) => {
                e.preventDefault()
                if (!props.open || !locatable) return   // 无锚点不猜、不误跳
                close()
                // 定位依据是 anchorKey（稳定消息标识）；关键词只用于定位后的高亮，
                // 且必须用服务端规范化过的那个串（与搜索保持一致）
                props.open(g.sessionId, { anchorKey: m.anchorKey, keyword: normQuery })
              },
            }, [head, text])
          })
          return h('div', { key: gi }, label, items)
        }),
      )

      return h('div', { className: 'dss-ov', onMouseDown: (e) => { if (e.target.className === 'dss-ov') close() } },
        h('div', { className: 'dss-card' },
          h('div', { className: 'dss-head', onKeyDown: onKey },
            h('span', { className: 'dss-close', title: t('dss.close'), onClick: close }, '✕'),
            h('div', { className: 'dss-field' },
              h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
                h('circle', { cx: '11', cy: '11', r: '7' }), h('path', { d: 'M21 21l-4.3-4.3' })),
              h('input', { ref: inputRef, value: q, placeholder: t('dss.placeholder'), onChange, onKeyDown: onKey }),
              q && h('span', { className: 'dss-clear', title: t('dss.clear'), onClick: clearQ }, '✕'),
            ),
          ),
          h('div', { className: 'dss-party' },
            [['all', t('dss.party.all')], ['ds', t('dss.party.ds')], ['user', t('dss.party.user')]].map(([p, label]) =>
              h('span', { className: 'chip ' + (party === p ? 'on' : ''), onClick: () => onParty(p) }, label)),
          ),
          h('div', { className: 'dss-body' }, body),
        ))
    }

    // ── 侧边栏搜索图标 ──
    function SearchEntry(props) {
      const t = props.t
      return h('span', { className: 'dss-entry-btn', title: t('dss.open'), onClick: () => overlayState.open() },
        h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2' },
          h('circle', { cx: '11', cy: '11', r: '7' }), h('path', { d: 'M21 21l-4.3-4.3' })))
    }

    const inject = ['slots', 'locale', 'connection', 'sessions', 'uiWorkspace']

    function dssDiag(msg) {
      try {
        console.error('[dsh-session-search]', msg)
        let el = document.getElementById('dss-diag')
        if (!el) {
          el = document.createElement('div')
          el.id = 'dss-diag'
          el.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:99999;max-width:70vw;background:rgba(180,40,40,.9);color:#fff;font-size:11px;padding:6px 8px;border-radius:6px;white-space:pre-wrap;'
          document.body.appendChild(el)
        }
        el.textContent = '[dsh-session-search] ' + msg
      } catch {}
    }

    function apply(ctx) {
      try {
        if (!document.getElementById('dss-css')) {
          const tag = document.createElement('style')
          tag.id = 'dss-css'
          tag.textContent = CSS
          document.head.appendChild(tag)
        }
        ctx.effect(() => ctx.locale.register(NS, dicts), 'dss: dictionaries')

        ctx.inject(['slots', 'connection', 'sessions', 'uiWorkspace'], (scope) => {
          // 必须用 scope 上的服务（cordis inject 的注入面）；用 ctx.sessions 可能取不到，
          // 而 `sessions?.open?.()` 一旦取不到会「静默不切换会话」——那正是跳到错会话的原因。
          const sessions = scope.sessions ?? ctx.sessions
          // 会话切换的现行 API 在 uiWorkspace 服务上（uiWorkspace.openSession）；
          // sessions 服务只提供 binding/scope/sessionOf 等，没有 open。
          const uiWorkspace = scope.uiWorkspace ??
            (typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : null) ?? ctx.uiWorkspace
          /**
           * 按「稳定锚点」定位目标消息。
           *
           * 目标由 anchorKey 唯一确定（= DOM 上的 data-chat-anchor-key，
           * 主机端由 DSH 事件规则生成）。关键词**只用于定位后的视觉高亮**，
           * 绝不参与选行 —— 否则同一会话出现相同关键词时会跳错消息。
           *
           * @param {string} sessionId - 目标会话 id。
           * @param {{ anchorKey: string|null, keyword?: string }} target - 目标消息。
           */
          const locateMessage = async (sessionId, target) => {
            const anchorKey = target && target.anchorKey ? String(target.anchorKey) : ''
            const keyword = target && target.keyword ? String(target.keyword) : ''
            const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
            const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
            // 惰性获取：会话切换是异步的，必须在渲染后再取，否则会抓到上一个会话的容器
            const currentScroller = () => document.querySelector('[data-conversation-scroll]')
            /** 属性选择器引号内的转义（只需处理反斜杠与双引号；不要用 CSS.escape）。 */
            const escapeAttr = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
            /** 在给定容器内按 anchorKey 精确查找目标行。 */
            const findRowByAnchor = (scroller) => {
              if (!scroller || !anchorKey) return null
              try {
                return scroller.querySelector(`[data-chat-anchor-key="${escapeAttr(anchorKey)}"]`)
              } catch {
                return null
              }
            }
            /** 读取目标会话的快照（权威数据源；DOM 只是它的投影）。 */
            const snapshotOf = (session) => {
              try {
                return session && typeof session.getSnapshot === 'function' ? session.getSnapshot() : null
              } catch { return null }
            }
            /** 目标锚点是否已存在于会话快照中（说明消息已加载，与渲染无关）。 */
            const inSnapshot = (session) => {
              const snap = snapshotOf(session)
              const nodes = snap && snap.chat && snap.chat.nodes
              return !!(nodes && anchorKey && typeof nodes.has === 'function' && nodes.has(anchorKey))
            }
            /** 当前 DOM 是否确实属于目标会话（用快照里的 key 抽样比对，避免「跳到别的会话」）。 */
            const domIsTargetSession = (session) => {
              const snap = snapshotOf(session)
              const order = snap && snap.chat && snap.chat.order
              const sp = currentScroller()
              if (!sp || !Array.isArray(order) || order.length === 0) return false
              return order.slice(0, 30).some((k) => {
                try { return !!sp.querySelector(`[data-chat-anchor-key="${escapeAttr(k)}"]`) } catch { return false }
              })
            }
            // 关键词精准高亮：只处理「文本节点」，绝不改写 innerHTML。
            //   —— 关键词若恰好匹配到属性名/标签名（如搜索 "class"、"div"），
            //      innerHTML 替换会破坏页面结构；文本节点 + textContent 则安全。
            const highlightKeyword = (row, kw) => {
              try {
                if (!row || !kw) return
                const ql = String(kw).toLowerCase()
                const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null)
                const targets = []
                let node
                while ((node = walker.nextNode())) {
                  if (node.nodeValue && node.nodeValue.toLowerCase().includes(ql)) targets.push(node)
                }
                for (const tnode of targets) {
                  const text = tnode.nodeValue
                  const lower = text.toLowerCase()
                  const frag = document.createDocumentFragment()
                  let cursor = 0
                  let idx = lower.indexOf(ql)
                  while (idx >= 0) {
                    if (idx > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, idx)))
                    const mark = document.createElement('span')
                    mark.setAttribute('data-dsh-kw-mark', '1')
                    mark.textContent = text.slice(idx, idx + ql.length) // textContent：不会被解析成 HTML
                    mark.style.background = '#1b74e4'
                    mark.style.color = '#fff'
                    mark.style.borderRadius = '2px'
                    mark.style.padding = '0 1px'
                    mark.style.fontWeight = '600'
                    frag.appendChild(mark)
                    cursor = idx + ql.length
                    idx = lower.indexOf(ql, cursor)
                  }
                  if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)))
                  if (tnode.parentNode) tnode.parentNode.replaceChild(frag, tnode)
                }
              } catch (error) {
                console.warn('[dsh-session-search] 关键词高亮失败', error)
              }
            }
            const clearPrev = () => {
              const prev = document.querySelector('[data-dsh-kw-located]')
              if (prev) {
                prev.removeAttribute('data-dsh-kw-located')
                prev.style.background = ''
              }
              // 把每个高亮 span 还原成文本节点，再 normalize 合并相邻文本
              document.querySelectorAll('span[data-dsh-kw-mark]').forEach((s) => {
                const parent = s.parentNode
                if (!parent) return
                parent.replaceChild(document.createTextNode(s.textContent ?? ''), s)
                parent.normalize()
              })
            }
            /** 兜底：按关键词在当前容器内找行（旧行为；锚点未命中时使用）。 */
            const findByKeyword = (scroller, kw) => {
              if (!scroller || !kw) return null
              const ql = String(kw).toLowerCase()
              for (const r of scroller.querySelectorAll('[data-chat-anchor-key]')) {
                const txt = r.textContent
                if (txt && txt.toLowerCase().includes(ql)) return r
              }
              return null
            }
            /** 诊断：把当前窗口里真实存在的锚点样本取出来（用于核对格式）。 */
            const sampleAnchors = () => {
              const sp = currentScroller()
              if (!sp) return '(没有 [data-conversation-scroll] 容器)'
              const all = [...sp.querySelectorAll('[data-chat-anchor-key]')]
              if (!all.length) return '(当前窗口没有带 data-chat-anchor-key 的行)'
              return all.slice(0, 3).map((r) => r.getAttribute('data-chat-anchor-key')).join('  |  ')
            }
            try {
              // 1) 取目标会话对象（open 是异步的：binding 可能要等一会儿才就绪）
              let session = null
              for (let i = 0; i < 40; i++) {
                const b = sessions && sessions.binding ? sessions.binding(sessionId) : null
                session = b && b.session ? b.session : null
                if (session) break
                await sleep(50)
                await nextFrame()
              }
              await sleep(100)
              await nextFrame()

              // 1b) 等 DOM 真正切到「目标会话」——用快照里的 key 抽样比对。
              //     这一步是关键：否则会在旧会话的 DOM 里找锚点，找不到就误降到别的会话。
              for (let i = 0; i < 40; i++) {
                if (session && domIsTargetSession(session)) break
                await nextFrame()
              }

              // 2) 用「会话快照」判定消息是否已加载（DOM 只是投影，快照才是权威）。
              //    若目标在更早的历史分页里，循环 loadOlder 直到它进入快照。
              if (anchorKey && session && typeof session.loadOlder === 'function') {
                for (let page = 0; page < 80 && !inSnapshot(session); page++) {
                  await session.loadOlder()
                  await nextFrame()
                  await nextFrame()
                }
              }

              // 3) DOM 定位（精确锚点；轮询等待渲染）
              let row = anchorKey ? findRowByAnchor(currentScroller()) : null
              for (let i = 0; i < 40 && row === null && anchorKey; i++) {
                await nextFrame()
                row = findRowByAnchor(currentScroller())
              }

              // 4) 兜底：仅当「DOM 确实属于目标会话」时才按关键词定位。
              //    —— 旧版无条件兜底，会在会话没切过去时跳到【别的会话】的同名关键词上。
              let usedFallback = false
              if (row === null && keyword && domIsTargetSession(session)) {
                usedFallback = true
                row = findByKeyword(currentScroller(), keyword)
              }

              if (!row) {
                dssDiag('未定位到目标消息\n目标锚点: ' + (anchorKey || '(无)') +
                  '\n会话已切换: ' + (domIsTargetSession(session) ? '是' : '否') +
                  '\nsession 对象: ' + (session
                    ? ('有' + (typeof session.loadOlder === 'function' ? '·loadOlder可用' : '·无loadOlder'))
                    : '未取到') +
                  '\n锚点在快照中: ' + (inSnapshot(session) ? '有（渲染未跟上）' : '无（格式不符或已折叠）') +
                  '\nDOM 实际锚点样本: ' + sampleAnchors())
                return
              }

              // 5) 定位成功：滚动 + 整行淡灰 + 关键词高亮（高亮纯视觉，不参与选行）
              clearPrev()
              row.setAttribute('data-dsh-kw-located', '1')
              row.scrollIntoView({ block: 'start', behavior: 'auto' })
              row.style.background = 'rgba(0,0,0,.05)'
              row.style.borderRadius = '6px'
              if (keyword) highlightKeyword(row, keyword)
              setTimeout(() => { clearPrev() }, 5000)
              if (usedFallback) {
                dssDiag('锚点未命中，已按关键词兜底定位\n目标锚点: ' + anchorKey +
                  '\nDOM 实际锚点样本: ' + sampleAnchors())
              }
            } catch (e) { dssDiag('定位异常: ' + String(e?.message || e)) }
          }
          scope.effect(() => scope.slots.register({
            name: 'shell.overlay',
            id: 'dsh-session-search-overlay',
            order: 50,
            locale: NS,
            inject: () => ({ connection: scope.get('connection') }),
          }, function SessionSearchOverlay(props) {
            return h(SearchOverlay, {
              t: props.t,
              // target = { anchorKey, keyword }：anchorKey 定位，keyword 仅用于高亮
              open: (id, target) => {
                try {
                  // 现行 DSH 客户端的会话切换入口是 uiWorkspace.openSession()；
                  // 旧写法 sessions.open() 在 0.2+/桌面端已不存在（服务上只有
                  // binding/retainInfo/scopeOf/scope/fork/push/map/subagentAddress/using/sessionOf）。
                  if (uiWorkspace && typeof uiWorkspace.openSession === 'function') {
                    uiWorkspace.openSession(id)
                    if (target) locateMessage(id, target)
                    return
                  }
                  // 兼容旧版宿主：老版本确实在 sessions 上暴露 open。
                  if (sessions && typeof sessions.open === 'function') {
                    sessions.open(id)
                    if (target) locateMessage(id, target)
                    return
                  }
                  dssDiag('无法切换会话：uiWorkspace.openSession 与 sessions.open 均不可用' +
                    '（uiWorkspace=' + (uiWorkspace ? 'object' : String(uiWorkspace)) +
                    ', sessions=' + (sessions ? 'object' : String(sessions)) + '）')
                } catch (e) { dssDiag('open 失败: ' + String(e?.message || e)) }
              },
            })
          }), 'dss: overlay registration')
        })

        ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
          name: "sidebar.footer.action",
          id: "dsh-session-search-entry",
          order: -10,
          locale: NS,
          inject: () => ({}),
        }, function SessionSearchEntry(props) {
          return h(SearchEntry, { t: props.t })
        }))
      } catch (e) { dssDiag('apply error: ' + String((e && e.stack) || e)) }
    }

    return { apply, inject }
  },
})
