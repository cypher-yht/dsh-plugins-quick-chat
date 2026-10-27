window.__ModuleLoader__.load({
  id: '@local/dsh-quick-chat',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'quick-chat';
    const ROOT_ATTR = 'data-dsh-quick-chat';

    const zh = {
      'fab.label': '快速聊天',
      'panel.title': '快速聊天',
      'panel.newThread': '新开一个聊天',
      'panel.close': '收起',
      'panel.closeThread': '关闭这个聊天',
      'panel.placeholder': '说点什么…（Enter 发送，Shift+Enter 换行）',
      'panel.send': '发送',
      'panel.empty': '这里不占用你当前的工作会话，随便聊。',
      'panel.thinking': '正在回复…',
      'panel.thread': '聊天 {n}',
      'panel.noThread': '还没有聊天，点右上角 ＋ 开始',
      'panel.error': '发送失败：{msg}',
      'panel.pending': '有 {n} 个聊天暂时打不开',
      'panel.retry': '重试',
      'panel.loading': '正在准备会话…',
      'a11y.region': '快速聊天',
      'role.user': '我',
      'role.assistant': '大肥鱼',
    };

    const en = {
      'fab.label': 'Quick chat',
      'panel.title': 'Quick chat',
      'panel.newThread': 'New chat',
      'panel.close': 'Hide',
      'panel.closeThread': 'Close this chat',
      'panel.placeholder': 'Say something… (Enter to send, Shift+Enter for a new line)',
      'panel.send': 'Send',
      'panel.empty': 'Chat here without leaving your current session.',
      'panel.thinking': 'Replying…',
      'panel.thread': 'Chat {n}',
      'panel.noThread': 'No chat yet — click ＋ at the top right',
      'panel.error': 'Send failed: {msg}',
      'panel.pending': '{n} chat(s) could not be reopened',
      'panel.retry': 'Retry',
      'panel.loading': 'Preparing session…',
      'a11y.region': 'Quick chat',
      'role.user': 'Me',
      'role.assistant': 'BigFish',
    };

    function format(template, vars) {
      if (typeof template !== 'string') return '';
      return template.replace(/\{(\w+)\}/g, (m, key) => (vars && vars[key] !== undefined ? String(vars[key]) : m));
    }

    /** Concatenate the visible text blocks of one message content array. */
    function blocksText(content) {
      if (typeof content === 'string') return content.trim();
      if (!Array.isArray(content)) return '';
      const parts = [];
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
        else if (block.type === 'image') parts.push('[image]');
      }
      return parts.join('').trim();
    }

    // #region markdown
    // Dependency-free, node-based Markdown rendering: model output never becomes raw
    // HTML, so it cannot smuggle markup in. Covers what chat answers actually use:
    // headings, paragraphs with hard breaks, bullet/ordered/task lists (nested),
    // blockquotes, fenced code with an info label, GFM pipe tables, rules, and inline
    // emphasis/strike/code/links/images. Streaming-safe: an unclosed fence stays a
    // code block instead of collapsing the message.
    const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Courier New", monospace';
    const INLINE_CODE_STYLE = {
      fontFamily: MONO, fontSize: 11, padding: '1px 4px', borderRadius: 4,
      background: 'rgba(127,127,127,0.16)', wordBreak: 'break-word',
    };
    const LINK_STYLE = {
      color: 'var(--dsw-alias-brand-primary)', textDecoration: 'underline',
      wordBreak: 'break-all', textUnderlineOffset: 2,
    };
    const IMAGE_STYLE = { display: 'block', maxWidth: '100%', maxHeight: 240, borderRadius: 8, margin: '2px 0' };
    const RULE_COLOR = 'var(--dsw-alias-border-l1)';
    const MUTED = 'var(--dsw-alias-label-secondary)';

    /** Only schemes that are safe to hand to an anchor/image; anything else renders as text. */
    function safeHref(raw) {
      const url = String(raw == null ? '' : raw).trim();
      if (!url) return null;
      if (/^(https?:|mailto:)/i.test(url)) return url;
      if (/^[/#.]|^[\w.-]+\.\w+(\/|$)/.test(url)) return url;
      if (/^data:image\/(png|jpe?g|gif|webp);/i.test(url)) return url;
      return null;
    }

    function leadingWidth(line) {
      let width = 0;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line.charAt(i);
        if (ch === ' ') width += 1;
        else if (ch === '\t') width += 4;
        else break;
      }
      return width;
    }

    function stripLead(line, width) {
      let consumed = 0;
      let index = 0;
      while (index < line.length && consumed < width) {
        const ch = line.charAt(index);
        if (ch === ' ') { consumed += 1; index += 1; }
        else if (ch === '\t') { consumed += 4; index += 1; }
        else break;
      }
      return line.slice(index);
    }

    function listMarkerOf(line) {
      const match = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/.exec(line);
      if (!match) return null;
      const indent = leadingWidth(match[1]);
      const marker = match[2];
      const ordered = /\d/.test(marker.charAt(0));
      return {
        indent,
        marker,
        ordered,
        start: ordered ? parseInt(marker, 10) || 1 : 1,
        text: match[3],
        contentIndent: indent + marker.length + 1,
      };
    }

    const HR_RE = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
    const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
    const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
    const QUOTE_RE = /^\s{0,3}>/;

    function isBlockStartLine(line) {
      return FENCE_RE.test(line) || HEADING_RE.test(line) || QUOTE_RE.test(line)
        || HR_RE.test(line) || !!listMarkerOf(line);
    }

    function splitRow(line) {
      let text = line.trim();
      if (text.charAt(0) === '|') text = text.slice(1);
      if (text.charAt(text.length - 1) === '|' && text.charAt(text.length - 2) !== '\\') text = text.slice(0, -1);
      const cells = [];
      let current = '';
      for (let i = 0; i < text.length; i += 1) {
        const ch = text.charAt(i);
        if (ch === '\\' && text.charAt(i + 1) === '|') { current += '|'; i += 1; continue; }
        if (ch === '|') { cells.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      cells.push(current.trim());
      return cells;
    }

    function isTableDelimiter(line) {
      if (line.indexOf('|') === -1) return false;
      const cells = splitRow(line);
      return cells.length > 0 && cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
    }

    function listBlockOf(lines, start) {
      const first = listMarkerOf(lines[start]);
      const baseIndent = first.indent;
      const items = [];
      let cursor = start;
      while (cursor < lines.length) {
        const marker = listMarkerOf(lines[cursor]);
        if (!marker || marker.indent !== baseIndent) break;
        const item = { lines: [marker.text], task: undefined };
        const task = /^\[( |x|X)\]\s+(.*)$/.exec(marker.text);
        if (task) { item.task = task[1].toLowerCase() === 'x'; item.lines = [task[2]]; }
        cursor += 1;
        while (cursor < lines.length) {
          const line = lines[cursor];
          if (!line.trim()) {
            let peek = cursor + 1;
            while (peek < lines.length && !lines[peek].trim()) peek += 1;
            if (peek >= lines.length) { cursor = peek; break; }
            const nestedAtBlank = listMarkerOf(lines[peek]);
            const indentedAtBlank = leadingWidth(lines[peek]) >= marker.contentIndent;
            if ((nestedAtBlank && nestedAtBlank.indent > baseIndent) || indentedAtBlank) {
              item.lines.push('');
              cursor += 1;
              continue;
            }
            break;
          }
          const nested = listMarkerOf(line);
          if (nested && nested.indent <= baseIndent) break;
          if (nested && nested.indent > baseIndent) {
            item.lines.push(stripLead(line, marker.contentIndent));
            cursor += 1;
            continue;
          }
          // A dedented block-level line that is not list content ends the item.
          if (leadingWidth(line) < marker.contentIndent && isBlockStartLine(line)) break;
          item.lines.push(stripLead(line, marker.contentIndent));
          cursor += 1;
        }
        items.push(item);
      }
      return { block: { type: 'list', ordered: first.ordered, start: first.start, items }, next: cursor };
    }

    /** Split source lines into block descriptors. */
    function parseBlocks(lines) {
      const blocks = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];
        if (!line.trim()) { i += 1; continue; }
        const fence = FENCE_RE.exec(line);
        if (fence) {
          const marker = fence[1];
          const lang = fence[2] || '';
          const body = [];
          i += 1;
          while (i < lines.length) {
            const close = /^\s{0,3}(`{3,}|~{3,})\s*$/.exec(lines[i]);
            if (close && close[1].charAt(0) === marker.charAt(0) && close[1].length >= marker.length) { i += 1; break; }
            body.push(lines[i]);
            i += 1;
          }
          blocks.push({ type: 'code', lang, text: body.join('\n') });
          continue;
        }
        const heading = HEADING_RE.exec(line);
        if (heading) {
          blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] });
          i += 1;
          continue;
        }
        if (HR_RE.test(line)) { blocks.push({ type: 'hr' }); i += 1; continue; }
        if (QUOTE_RE.test(line)) {
          const inner = [];
          while (i < lines.length && QUOTE_RE.test(lines[i])) {
            inner.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
            i += 1;
          }
          blocks.push({ type: 'quote', blocks: parseBlocks(inner) });
          continue;
        }
        if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
          const header = splitRow(line);
          const aligns = splitRow(lines[i + 1]).map((cell) => {
            const text = cell.trim();
            const left = text.charAt(0) === ':';
            const right = text.charAt(text.length - 1) === ':';
            if (left && right) return 'center';
            if (right) return 'right';
            if (left) return 'left';
            return '';
          });
          i += 2;
          const rows = [];
          while (i < lines.length && lines[i].trim() && lines[i].indexOf('|') >= 0) {
            rows.push(splitRow(lines[i]));
            i += 1;
          }
          blocks.push({ type: 'table', header, aligns, rows });
          continue;
        }
        if (listMarkerOf(line)) {
          const parsed = listBlockOf(lines, i);
          blocks.push(parsed.block);
          i = parsed.next;
          continue;
        }
        const paragraph = [];
        while (i < lines.length && lines[i].trim() && !isBlockStartLine(lines[i])) {
          paragraph.push(lines[i].trim());
          i += 1;
        }
        if (!paragraph.length) { paragraph.push(line.trim()); i += 1; }
        blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
      }
      return blocks;
    }

    /** Parse `[label](target "title")` starting at an opening bracket. */
    function readLink(source, start) {
      if (source.charAt(start) !== '[') return null;
      let depth = 0;
      let i = start;
      for (; i < source.length; i += 1) {
        const ch = source.charAt(i);
        if (ch === '\\') { i += 1; continue; }
        if (ch === '[') depth += 1;
        else if (ch === ']') { depth -= 1; if (depth === 0) break; }
      }
      if (depth !== 0) return null;
      if (source.charAt(i + 1) !== '(') return null;
      let target = '';
      let parens = 1;
      let j = i + 2;
      for (; j < source.length; j += 1) {
        const ch = source.charAt(j);
        if (ch === '\\') { target += source.charAt(j + 1) || ''; j += 1; continue; }
        if (ch === '(') { parens += 1; target += ch; continue; }
        if (ch === ')') { parens -= 1; if (parens === 0) break; target += ch; continue; }
        target += ch;
      }
      if (parens !== 0) return null;
      const space = target.search(/\s/);
      const url = (space === -1 ? target : target.slice(0, space)).replace(/^<|>$/g, '').trim();
      return { label: source.slice(start + 1, i), url, end: j + 1 };
    }

    const ESCAPABLE = '\\`*_{}[]()#+-.!~>|';

    /** Inline Markdown -> React nodes (code, images, links, strong/em/strike, breaks). */
    function inlineNodes(text, nextKey) {
      const source = String(text == null ? '' : text);
      const out = [];
      let buffer = '';
      let i = 0;
      const flush = () => { if (buffer) { out.push(buffer); buffer = ''; } };
      const push = (node) => { flush(); out.push(node); };
      const anchor = (href, children, key) => h('a', {
        key, href, target: '_blank', rel: 'noopener noreferrer', style: LINK_STYLE,
      }, children);

      while (i < source.length) {
        const ch = source.charAt(i);
        if (ch === '\\' && i + 1 < source.length && ESCAPABLE.indexOf(source.charAt(i + 1)) >= 0) {
          buffer += source.charAt(i + 1);
          i += 2;
          continue;
        }
        if (ch === '`') {
          let run = 1;
          while (source.charAt(i + run) === '`') run += 1;
          const fenceish = source.substr(i, run);
          const close = source.indexOf(fenceish, i + run);
          if (close !== -1) {
            push(h('code', { key: nextKey(), style: INLINE_CODE_STYLE }, source.slice(i + run, close).replace(/\n/g, ' ')));
            i = close + run;
            continue;
          }
          buffer += fenceish;
          i += run;
          continue;
        }
        if (ch === '!' && source.charAt(i + 1) === '[') {
          const image = readLink(source, i + 1);
          if (image) {
            const src = safeHref(image.url);
            push(src
              ? h('img', { key: nextKey(), src, alt: image.label, style: IMAGE_STYLE })
              : image.label);
            i = image.end;
            continue;
          }
        }
        if (ch === '[') {
          const link = readLink(source, i);
          if (link) {
            const href = safeHref(link.url);
            const label = link.label || link.url;
            push(href ? anchor(href, inlineNodes(label, nextKey), nextKey()) : label);
            i = link.end;
            continue;
          }
        }
        if (ch === '<') {
          const auto = /^<(https?:\/\/[^>\s]+)>/.exec(source.slice(i));
          if (auto) {
            push(anchor(auto[1], auto[1], nextKey()));
            i += auto[0].length;
            continue;
          }
        }
        if (ch === '*' || ch === '_' || ch === '~') {
          let run = 1;
          while (source.charAt(i + run) === ch) run += 1;
          const strong = run >= 2 || ch === '~';
          const size = ch === '~' ? (run >= 2 ? 2 : 0) : (run >= 2 ? 2 : 1);
          const marker = ch.repeat(size);
          if (size) {
            const from = i + size;
            const close = source.indexOf(marker, from);
            const opensCleanly = close > from
              && !/\s/.test(source.charAt(from))
              && !(ch === '_' && i > 0 && /\w/.test(source.charAt(i - 1)));
            const closesCleanly = opensCleanly
              && !/\s/.test(source.charAt(close - 1))
              && !(ch === '_' && /\w/.test(source.charAt(close + size)));
            if (opensCleanly && closesCleanly) {
              const inner = inlineNodes(source.slice(from, close), nextKey);
              if (ch === '~') push(h('del', { key: nextKey() }, inner));
              else if (strong) push(h('strong', { key: nextKey() }, inner));
              else push(h('em', { key: nextKey() }, inner));
              i = close + size;
              continue;
            }
          }
          buffer += source.substr(i, run);
          i += run;
          continue;
        }
        if (ch === '\n') { push(h('br', { key: nextKey() })); i += 1; continue; }
        if (ch === 'h' && /^https?:\/\//.test(source.slice(i, i + 8))) {
          const bare = /^https?:\/\/[^\s<>"'`)\]]+/.exec(source.slice(i));
          if (bare) {
            push(anchor(bare[0], bare[0], nextKey()));
            i += bare[0].length;
            continue;
          }
        }
        buffer += ch;
        i += 1;
      }
      flush();
      return out.length ? out : [''];
    }

    const HEADING_PX = { 1: 16, 2: 15, 3: 14, 4: 13, 5: 12.5, 6: 12 };

    function codeBlockNode(block, nextKey) {
      return h('div', {
        key: nextKey(),
        style: {
          border: '1px solid ' + RULE_COLOR, borderRadius: 6, overflow: 'hidden',
          background: 'rgba(127,127,127,0.10)',
        },
      },
        block.lang
          ? h('div', {
              style: { fontSize: 10, lineHeight: '14px', color: MUTED, padding: '2px 8px', background: 'rgba(127,127,127,0.12)' },
            }, block.lang)
          : null,
        h('pre', {
          style: { margin: 0, padding: '6px 8px', overflowX: 'auto', fontSize: 11, lineHeight: '16px' },
        }, h('code', { style: { fontFamily: MONO, whiteSpace: 'pre', display: 'block' } }, block.text)));
    }

    function tableNode(block, nextKey) {
      const cell = (align) => ({
        padding: '3px 6px', border: '1px solid ' + RULE_COLOR, textAlign: align || 'left', verticalAlign: 'top',
      });
      return h('div', { key: nextKey(), style: { overflowX: 'auto' } },
        h('table', { style: { borderCollapse: 'collapse', fontSize: 11, lineHeight: '16px' } },
          h('thead', null,
            h('tr', null, block.header.map((text, column) => h('th', {
              key: nextKey(),
              style: Object.assign(cell(block.aligns[column]), { fontWeight: 600, background: 'rgba(127,127,127,0.12)', whiteSpace: 'nowrap' }),
            }, inlineNodes(text, nextKey))))),
          h('tbody', null,
            block.rows.map((row) => h('tr', { key: nextKey() },
              block.header.map((_, column) => h('td', { key: nextKey(), style: cell(block.aligns[column]) },
                inlineNodes(row[column] == null ? '' : row[column], nextKey))))))));
    }

    function listNode(block, nextKey) {
      const items = block.items.map((item) => {
        const blocks = parseBlocks(item.lines);
        const children = [];
        if (item.task !== undefined && blocks.length && blocks[0].type === 'paragraph') {
          const first = blocks.shift();
          children.push(h('div', {
            key: nextKey(),
            style: { display: 'flex', alignItems: 'flex-start', gap: 6 },
          },
            h('input', {
              key: nextKey(),
              type: 'checkbox',
              checked: !!item.task,
              readOnly: true,
              style: { margin: '3px 0 0', accentColor: 'var(--dsw-alias-brand-primary)' },
            }),
            h('span', { style: { flex: 1 } }, inlineNodes(first.text, nextKey))));
        }
        for (const child of renderBlocks(blocks, nextKey)) children.push(child);
        return h('li', { key: nextKey(), style: { margin: '2px 0' } }, children);
      });
      const tag = block.ordered ? 'ol' : 'ul';
      const props = { key: nextKey(), style: { margin: 0, paddingLeft: 18 } };
      if (block.ordered) {
        props.style.listStyleType = 'decimal';
        if (block.start !== 1) props.start = block.start;
      }
      return h(tag, props, items);
    }

    function renderBlocks(blocks, nextKey) {
      const nodes = [];
      for (const block of blocks) {
        if (block.type === 'heading') {
          const size = HEADING_PX[block.level] || 12;
          nodes.push(h('div', {
            key: nextKey(),
            style: { fontSize: size, fontWeight: 700, lineHeight: '22px', color: 'var(--dsw-alias-label-primary)' },
          }, inlineNodes(block.text, nextKey)));
        } else if (block.type === 'paragraph') {
          nodes.push(h('div', { key: nextKey(), style: { lineHeight: '18px' } }, inlineNodes(block.text, nextKey)));
        } else if (block.type === 'code') {
          nodes.push(codeBlockNode(block, nextKey));
        } else if (block.type === 'quote') {
          nodes.push(h('blockquote', {
            key: nextKey(),
            style: { margin: 0, paddingLeft: 8, borderLeft: '2px solid ' + RULE_COLOR, color: MUTED },
          }, renderBlocks(block.blocks, nextKey)));
        } else if (block.type === 'list') {
          nodes.push(listNode(block, nextKey));
        } else if (block.type === 'table') {
          nodes.push(tableNode(block, nextKey));
        } else if (block.type === 'hr') {
          nodes.push(h('hr', { key: nextKey(), style: { margin: '2px 0', border: 'none', borderTop: '1px solid ' + RULE_COLOR } }));
        }
      }
      return nodes;
    }

    /** Assistant text -> one column of rendered blocks. */
    function messageBody(text, prefix) {
      const source = String(text == null ? '' : text);
      if (!source.trim()) return source;
      const counter = { n: 0 };
      const nextKey = () => prefix + '-k' + (counter.n += 1);
      const blocks = parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
      return h('div', {
        style: { display: 'flex', flexDirection: 'column', gap: 6, whiteSpace: 'normal', wordBreak: 'break-word', minWidth: 0 },
      }, renderBlocks(blocks, nextKey));
    }
    // #endregion markdown

    /**
     * Rebuild a compact transcript from a session event window.
     * user/message data is the UserMessage itself; assistant/message nests it under `message`.
     */
    function transcriptOf(window) {
      const out = [];
      const entries = window && Array.isArray(window.entries) ? window.entries : [];
      for (const entry of entries) {
        if (!entry || entry.type !== 'event' || !entry.event) continue;
        const event = entry.event;
        if (event.type === 'user/message') {
          const kind = event.data && event.data.source && event.data.source.kind;
          if (kind !== undefined && kind !== 'user') continue;
          const text = blocksText(event.data && event.data.content);
          if (text) out.push({ role: 'user', text, seq: event.seq });
        } else if (event.type === 'assistant/message') {
          const message = event.data && event.data.message;
          const text = blocksText(message && message.content);
          if (text) out.push({ role: 'assistant', text, seq: event.seq });
        }
      }
      return out;
    }

    const THREADS_KEY = 'dsh-quick-chat.threads.v1';
    // Last working directory we created a chat in; only a fallback when the main view has no session.
    const WORKSPACE_KEY = 'dsh-quick-chat.workspace.v1';
    const LEGACY_SEED_KEY = 'dsh-quick-chat.legacy-seeded.v1';
    // Chats the first panel build created in the profile's default workspace, before it
    // remembered anything. Seeded once so that history is not lost.
    const LEGACY_THREADS = [
      { sessionId: 'session-bd758fd9-9b08-4899-9e2e-39427ffbdd07', title: '早先的聊天 1' },
      { sessionId: 'session-f326a928-fe51-42d0-892e-516fa08981ca', title: '早先的聊天 2' },
    ];
    // Threads an older build erased when a page load could not re-attach their sessions.
    // Recovered from the app's own stored history and re-offered exactly once.
    const RECOVERY_KEY = 'dsh-quick-chat.recovered.v1';
    const RECOVERY_THREADS = [
      { sessionId: 'session-40596daf-e06e-43b8-8863-ef6f5bd323a4', title: '给对话安装无限上下文插件' },
      { sessionId: 'session-bd758fd9-9b08-4899-9e2e-39427ffbdd07', title: '浮窗头像图片加载问题' },
      { sessionId: 'session-f326a928-fe51-42d0-892e-516fa08981ca', title: '大肥鱼' },
    ];
    // Cookies ignore the port, so they survive a restart that hands the page a new
    // 127.0.0.1:<port> origin. localStorage stays the primary store; the cookie is a mirror.
    const THREADS_COOKIE = 'dsh_quick_chat_threads';
    const COOKIE_LIMIT = 3600;

    function readFlag(key) {
      try { return localStorage.getItem(key) === '1'; } catch { return false; }
    }

    function writeFlag(key) {
      try { localStorage.setItem(key, '1'); } catch {}
    }

    function readCookieValue(name) {
      try {
        for (const part of String(document.cookie || '').split(';')) {
          const index = part.indexOf('=');
          if (index < 0) continue;
          if (part.slice(0, index).trim() !== name) continue;
          return decodeURIComponent(part.slice(index + 1));
        }
      } catch {}
      return '';
    }

    function writeCookieValue(name, value) {
      try {
        document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=31536000; SameSite=Lax';
      } catch {}
    }

    function parseSavedThreads(raw) {
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.threads)) return null;
        return parsed;
      } catch {
        return null;
      }
    }

    /** Only session ids are stored here; the transcript itself lives in DSH's own session log. */
    function readSavedThreads() {
      let saved = null;
      try { saved = parseSavedThreads(localStorage.getItem(THREADS_KEY)); } catch {}
      if (saved) return saved;
      const mirrored = parseSavedThreads(readCookieValue(THREADS_COOKIE));
      if (mirrored) {
        try { localStorage.setItem(THREADS_KEY, JSON.stringify(mirrored)); } catch {}
        return mirrored;
      }
      return null;
    }

    /**
     * Persist the index. `pending` keeps session ids that could not be re-attached yet:
     * dropping them would permanently lose the only record of those chats.
     */
    function saveThreads(store) {
      const payload = {
        counter: store.counter,
        active: store.active,
        threads: store.threads.map((thread) => ({
          key: thread.key,
          sessionId: thread.sessionId,
          title: thread.title,
        })),
        pending: (store.pending || []).slice(0, 20),
      };
      const serialized = JSON.stringify(payload);
      try { localStorage.setItem(THREADS_KEY, serialized); } catch {}
      if (serialized.length <= COOKIE_LIMIT) writeCookieValue(THREADS_COOKIE, serialized);
    }

    function makePanel(t, ctx) {
      const resolve = (name) => {
        try {
          return ctx.get ? ctx.get(name) : undefined;
        } catch {
          return undefined;
        }
      };

      // One panel instance per page: keep thread state in a closure so the render
      // path needs no hook beyond useState/useEffect.
      const store = { threads: [], active: null, counter: 0, pending: [] };

      return function QuickChatPanel(props) {
        const [open, setOpen] = React.useState(false);
        const [, bump] = React.useState(0);
        const [, setLocaleRevision] = React.useState(0);
        const [draft, setDraft] = React.useState('');
        const [busy, setBusy] = React.useState(false);
        const [error, setError] = React.useState(null);
        // Anchor next to the 大肥鱼 sticker pet; null falls back to the bottom-right corner.
        const [anchor, setAnchor] = React.useState(null);

        let disposed = false;
        const notify = () => { if (!disposed) bump((v) => v + 1); };
        const activeThread = () => store.threads.find((thread) => thread.key === store.active);

        // The main view's session tells us the current workspace directory.
        try {
          const useSessions = props && props.useSessions;
          if (typeof useSessions === 'function') {
            const cwd = useSessions((state) => {
              if (!state || !state.byId) return undefined;
              const current = Object.values(state.byId).find((session) => {
                const retainedBy = session && session.retainedBy;
                return retainedBy && (retainedBy.mainView || 0) > 0;
              });
              return current ? current.cwd : undefined;
            });
            if (typeof cwd === 'string' && cwd) store.currentCwd = cwd;
          }
        } catch {
          // selectors are a best-effort convenience; create falls back on the last known cwd
        }

        React.useEffect(() => {
          const subscribeLocale = resolve('locale') && ctx.locale && typeof ctx.locale.subscribe === 'function'
            ? ctx.locale.subscribe(() => setLocaleRevision((v) => v + 1))
            : () => {};
          return () => { try { subscribeLocale() } catch {} };
        }, []);

        // The sticker pet is a fixed, draggable element; poll its box so the button follows it.
        React.useEffect(() => {
          let timer = 0;
          let stopped = false;
          const measure = () => {
            if (stopped) return;
            let next = null;
            try {
              const pet = document.querySelector('[data-nekowhale-pet]');
              if (pet) {
                const rect = pet.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  next = {
                    left: Math.max(8, Math.round(rect.left - 48)),
                    top: Math.round(rect.top + rect.height - 48),
                  };
                }
              }
            } catch {
              next = null;
            }
            setAnchor((prev) => {
              if (!prev && !next) return prev;
              if (prev && next && Math.abs(prev.left - next.left) < 0.5 && Math.abs(prev.top - next.top) < 0.5) return prev;
              return next;
            });
            timer = setTimeout(measure, 400);
          };
          measure();
          return () => { stopped = true; if (timer) clearTimeout(timer); };
        }, []);

        // Restore last time's chats on every page load; DSH reloads their history from its own
        // log. A chat that cannot be attached *yet* is kept as pending and retried, because
        // this index is the only record of which sessions the panel owns.
        React.useEffect(() => {
          let cancelled = false;
          restoreThreads(() => cancelled).catch(() => {});
          return () => { cancelled = true; };
        }, []);

        React.useEffect(() => () => {
          disposed = true;
          for (const thread of store.threads) {
            for (const stop of thread.stop) { try { stop() } catch {} }
            try { thread.ref && thread.ref.release && thread.ref.release() } catch {}
          }
          store.threads = [];
        }, []);

        /** Retain one session and wire its transcript; undefined when it can no longer be opened. */
        const attachThread = async (sessionId, title, key) => {
          const sessions = resolve('sessions');
          if (!sessions || typeof sessions.retain !== 'function') return undefined;
          let ref;
          try {
            ref = sessions.retain(sessionId, { source: 'gateway' });
          } catch {
            return undefined;
          }
          let binding = ref && ref.binding;
          if (!binding && ref && ref.ready) {
            try { binding = await ref.ready; } catch { binding = undefined }
          }
          // Some builds only expose the binding through the lookup once the generation opens.
          if (!binding && typeof sessions.binding === 'function') {
            for (let attempt = 0; attempt < 20 && !binding; attempt += 1) {
              binding = sessions.binding(sessionId);
              if (!binding) await new Promise((done) => setTimeout(done, 100));
            }
          }
          if (!binding) {
            try { ref && ref.release && ref.release(); } catch {}
            return undefined;
          }
          const thread = {
            key: key || ('t' + (store.counter += 1)),
            sessionId,
            title: title || String(sessionId).slice(0, 8),
            ref,
            binding,
            messages: [],
            running: false,
            unseen: 0,
            stop: [],
          };
          const eventSource = binding.eventSource;
          if (eventSource && typeof eventSource.subscribe === 'function') {
            const read = () => {
              const next = transcriptOf(eventSource.getSnapshot && eventSource.getSnapshot());
              if (next.length > thread.messages.length && store.active !== thread.key) {
                thread.unseen = (thread.unseen || 0) + (next.length - thread.messages.length);
              }
              thread.messages = next;
              notify();
            };
            read();
            thread.stop.push(eventSource.subscribe(read));
          }
          const face = binding.session;
          if (face && typeof face.subscribe === 'function') {
            const readState = () => {
              const snapshot = face.getSnapshot && face.getSnapshot();
              thread.running = !!(snapshot && snapshot.running);
              notify();
            };
            readState();
            thread.stop.push(face.subscribe(readState));
          }
          return thread;
        };

        /** Retention can race the first connection opening, so give it a few chances. */
        const attachThreadWithRetry = async (sessionId, title, key, isCancelled) => {
          for (let attempt = 0; attempt < 10; attempt += 1) {
            if (isCancelled()) return undefined;
            const thread = await attachThread(sessionId, title, key);
            if (thread) return thread;
            if (isCancelled()) return undefined;
            await new Promise((done) => setTimeout(done, Math.min(1500, 150 + attempt * 150)));
          }
          return undefined;
        };

        /**
         * Rebuild the thread list from the stored index plus the one-time recovery seeds.
         * Ids that still cannot be retained stay in `store.pending`: the index is never
         * overwritten with an empty list just because a page load happened before the
         * connection was ready.
         */
        const restoreThreads = async (isCancelled) => {
          const saved = readSavedThreads();
          const wanted = [];
          const seen = new Set();
          const want = (sessionId, title, key) => {
            if (!sessionId || typeof sessionId !== 'string' || seen.has(sessionId)) return;
            seen.add(sessionId);
            wanted.push({ sessionId, title: typeof title === 'string' ? title : '', key });
          };
          if (saved) {
            store.counter = Math.max(store.counter, Number(saved.counter) || 0);
            for (const item of saved.threads || []) want(item && item.sessionId, item && item.title, item && item.key);
            for (const id of saved.pending || []) want(id);
          }
          const seedRecovery = !readFlag(RECOVERY_KEY);
          if (seedRecovery) for (const seed of RECOVERY_THREADS) want(seed.sessionId, seed.title);
          const seedLegacy = !readFlag(LEGACY_SEED_KEY);
          if (seedLegacy) for (const seed of LEGACY_THREADS) want(seed.sessionId, seed.title);
          if (!wanted.length || isCancelled()) return;
          const failed = [];
          for (const item of wanted) {
            if (isCancelled()) return;
            if (store.threads.some((thread) => thread.sessionId === item.sessionId)) continue;
            const thread = await attachThreadWithRetry(item.sessionId, item.title, item.key, isCancelled);
            if (isCancelled()) {
              try { thread && thread.ref && thread.ref.release && thread.ref.release(); } catch {}
              return;
            }
            if (thread) store.threads.push(thread);
            else failed.push(item.sessionId);
          }
          store.pending = failed;
          const savedActive = saved && saved.active;
          store.active = savedActive && store.threads.some((thread) => thread.key === savedActive)
            ? savedActive
            : (store.threads[0] ? store.threads[0].key : null);
          for (const thread of store.threads) thread.unseen = 0;
          if (store.threads.length || failed.length) saveThreads(store);
          // Mark the seeds as offered only after the index holds them (as threads or pending).
          if (seedRecovery) writeFlag(RECOVERY_KEY);
          if (seedLegacy) writeFlag(LEGACY_SEED_KEY);
          notify();
        };

        const retryPending = async () => {
          if (busy) return;
          setBusy(true);
          try { await restoreThreads(() => false); } finally { setBusy(false); }
        };

        /** Chats belong to the workspace the main view is currently showing. */
        let cachedWorkspaceId;
        const workspaceIdOf = async () => {
          if (cachedWorkspaceId !== undefined) return cachedWorkspaceId;
          let path = store.currentCwd;
          if (!path) {
            try {
              const saved = localStorage.getItem(WORKSPACE_KEY);
              if (saved) path = saved;
            } catch {}
          }
          if (!path) {
            // No main-view session yet: let the Host pick the default workspace.
            cachedWorkspaceId = null;
            return cachedWorkspaceId;
          }
          const workspaces = resolve('workspaces');
          if (workspaces && typeof workspaces.create === 'function') {
            try {
              const view = await workspaces.create({ path });
              if (view && view.workspaceId) {
                try { localStorage.setItem(WORKSPACE_KEY, path); } catch {}
                cachedWorkspaceId = view.workspaceId;
                return cachedWorkspaceId;
              }
            } catch {
              // fall back to the Host default workspace below
            }
          }
          cachedWorkspaceId = null;
          return cachedWorkspaceId;
        };

        const createThread = async () => {
          const sessions = resolve('sessions');
          if (!sessions || typeof sessions.create !== 'function') {
            setError(t('panel.error').replace('{msg}', 'sessions service unavailable'));
            return undefined;
          }
          setBusy(true);
          setError(null);
          try {
            const workspaceId = await workspaceIdOf();
            const sessionId = await sessions.create(workspaceId ? { workspaceId } : {});
            store.counter += 1;
            const thread = await attachThread(sessionId, format(t('panel.thread'), { n: store.counter }), 't' + store.counter);
            if (!thread) throw new Error('session could not be retained');
            store.threads.push(thread);
            store.active = thread.key;
            saveThreads(store);
            notify();
            return thread;
          } catch (err) {
            setError(t('panel.error').replace('{msg}', err && err.message ? err.message : String(err)));
            return undefined;
          } finally {
            setBusy(false);
          }
        };

        const selectThread = (key) => {
          store.active = key;
          const thread = store.threads.find((item) => item.key === key);
          if (thread) thread.unseen = 0;
          saveThreads(store);
          notify();
        };

        const closeThread = (key) => {
          const index = store.threads.findIndex((item) => item.key === key);
          if (index < 0) return;
          const [thread] = store.threads.splice(index, 1);
          for (const stop of thread.stop) { try { stop() } catch {} }
          try { thread.ref && thread.ref.release && thread.ref.release() } catch {}
          if (store.active === key) store.active = store.threads.length ? store.threads[Math.max(0, index - 1)].key : null;
          saveThreads(store);
          notify();
        };

        const send = async () => {
          const text = draft.trim();
          if (!text || busy) return;
          let thread = activeThread();
          if (!thread) thread = await createThread();
          if (!thread) return;
          const face = thread.binding && thread.binding.session;
          if (!face || typeof face.prompt !== 'function') {
            setError(t('panel.error').replace('{msg}', 'session not ready'));
            return;
          }
          setBusy(true);
          setError(null);
          try {
            const result = await face.prompt([{ type: 'text', text }], 'queue');
            if (result && result.ok === false) {
              const failure = result.error;
              throw new Error(failure && (failure.message || failure.code) ? (failure.message || failure.code) : 'prompt rejected');
            }
            setDraft('');
          } catch (err) {
            setError(t('panel.error').replace('{msg}', err && err.message ? err.message : String(err)));
          } finally {
            setBusy(false);
          }
        };

        const onKeyDown = (event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        };

        const openPanel = async () => {
          setOpen(true);
          if (store.threads.length === 0) await createThread();
        };

        const fabStyle = {
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1px solid var(--dsw-alias-border-l1)',
          background: 'var(--dsw-alias-bg-overlay)',
          color: 'var(--dsw-alias-brand-primary)',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.16)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          pointerEvents: 'auto',
          transition: 'transform 160ms ease',
          transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
        };

        const chipStyle = (isActive) => ({
          border: '1px solid ' + (isActive ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-border-l1)'),
          background: isActive ? 'var(--dsw-alias-bg-layer-2)' : 'transparent',
          color: isActive ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
          borderRadius: 999,
          padding: '2px 9px',
          fontSize: 11,
          lineHeight: '16px',
          cursor: 'pointer',
          font: 'inherit',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        });

        const messages = activeThread() ? activeThread().messages : [];
        const running = activeThread() ? activeThread().running : false;
        const rootStyle = anchor
          ? { position: 'fixed', left: anchor.left, top: anchor.top, zIndex: 45, pointerEvents: 'none' }
          : { position: 'fixed', right: 20, bottom: 52, zIndex: 45, pointerEvents: 'none' };
        const flipPanel = !!anchor && anchor.left < 380;

        return h('div', {
          [ROOT_ATTR]: '',
          style: rootStyle,
          role: 'region',
          'aria-label': t('a11y.region'),
        },
          open
            ? h('div', {
                style: {
                  position: 'absolute',
                  ...(flipPanel ? { left: 0 } : { right: 0 }),
                  bottom: 50,
                  width: 358,
                  height: 430,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 14,
                  border: '1px solid var(--dsw-alias-border-l1)',
                  background: 'var(--dsw-alias-bg-overlay)',
                  boxShadow: '0 16px 40px rgba(0, 0, 0, 0.24)',
                  overflow: 'hidden',
                  pointerEvents: 'auto',
                },
              },
                // header
                h('div', {
                  style: {
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 10px',
                    borderBottom: '1px solid var(--dsw-alias-border-l1)',
                  },
                },
                  h('span', { style: { fontSize: 12, fontWeight: 700, color: 'var(--dsw-alias-label-primary)' } }, t('panel.title')),
                  h('span', { style: { flex: 1 } }),
                  h('button', {
                    type: 'button',
                    title: t('panel.newThread'),
                    'aria-label': t('panel.newThread'),
                    onClick: () => createThread(),
                    disabled: busy,
                    style: {
                      width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                      border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
                      color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 14, lineHeight: '18px',
                    },
                  }, '＋'),
                  h('button', {
                    type: 'button',
                    title: t('panel.close'),
                    'aria-label': t('panel.close'),
                    onClick: () => setOpen(false),
                    style: {
                      width: 24, height: 24, borderRadius: 6, cursor: 'pointer',
                      border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
                      color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 12, lineHeight: '18px',
                    },
                  }, '×'),
                ),
                // Chats whose session could not be reopened yet: keep the record, offer a retry.
                store.pending.length
                  ? h('div', {
                      style: {
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                        borderBottom: '1px solid var(--dsw-alias-border-l1)',
                        fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary)',
                      },
                    },
                      h('span', { style: { flex: 1 } }, format(t('panel.pending'), { n: store.pending.length })),
                      h('button', {
                        type: 'button',
                        onClick: retryPending,
                        disabled: busy,
                        style: {
                          border: 'none', background: 'transparent', padding: 0, font: 'inherit', fontSize: 11,
                          color: 'var(--dsw-alias-brand-primary)', cursor: busy ? 'default' : 'pointer',
                        },
                      }, t('panel.retry')),
                    )
                  : null,
                // Thread chips wrap instead of running as one long horizontal strip: a long
                // title can no longer push the other chats out of reach, and the strip
                // scrolls vertically (native wheel) once it holds more rows than fit.
                store.threads.length > 1
                  ? h('div', {
                      style: {
                        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6,
                        padding: '6px 10px', maxHeight: 82, overflowY: 'auto', overflowX: 'hidden',
                        borderBottom: '1px solid var(--dsw-alias-border-l1)',
                      },
                    },
                      ...store.threads.map((thread) => h('span', {
                        key: thread.key,
                        style: { display: 'inline-flex', alignItems: 'center', gap: 2, maxWidth: 168, minWidth: 0 },
                      },
                        h('button', {
                          type: 'button',
                          onClick: () => selectThread(thread.key),
                          style: Object.assign(chipStyle(thread.key === store.active), {
                            maxWidth: 144, minWidth: 0, overflow: 'hidden',
                          }),
                          title: thread.title,
                        },
                          thread.unseen ? h('span', {
                            style: { flex: '0 0 auto', width: 6, height: 6, borderRadius: '50%', background: 'var(--dsw-alias-state-error-primary)' },
                          }) : null,
                          h('span', {
                            style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
                          }, thread.title),
                        ),
                        h('button', {
                          type: 'button',
                          title: t('panel.closeThread'),
                          'aria-label': t('panel.closeThread'),
                          onClick: () => closeThread(thread.key),
                          style: {
                            flex: '0 0 auto', border: 'none', background: 'transparent', cursor: 'pointer',
                            color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 11,
                            padding: 0, lineHeight: '14px',
                          },
                        }, '×'),
                      )),
                    )
                  : null,
                // transcript
                h('div', {
                  style: { flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 },
                },
                  store.threads.length === 0
                    ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('panel.noThread'))
                    : messages.length === 0
                      ? h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } }, t('panel.empty'))
                      : null,
                  ...messages.map((message, index) => h('div', {
                    key: (message.seq || index) + '-' + message.role,
                    style: {
                      alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: message.role === 'user' ? '86%' : '92%',
                      padding: '6px 10px',
                      borderRadius: 10,
                      fontSize: 12,
                      lineHeight: '18px',
                      whiteSpace: message.role === 'user' ? 'pre-wrap' : 'normal',
                      wordBreak: 'break-word',
                      background: message.role === 'user' ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-bg-layer-2)',
                      color: message.role === 'user' ? 'var(--dsw-alias-bg-base)' : 'var(--dsw-alias-label-primary)',
                      border: message.role === 'user' ? 'none' : '1px solid var(--dsw-alias-border-l1)',
                    },
                  }, message.role === 'user' ? message.text : messageBody(message.text, String(index)))),
                  running
                    ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)' } }, t('panel.thinking'))
                    : null,
                ),
                // composer
                h('div', {
                  style: { borderTop: '1px solid var(--dsw-alias-border-l1)', padding: 8, display: 'flex', flexDirection: 'column', gap: 6 },
                },
                  error
                    ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)' } }, error)
                    : null,
                  h('div', { style: { display: 'flex', gap: 6, alignItems: 'flex-end' } },
                    h('textarea', {
                      value: draft,
                      onChange: (event) => setDraft(event.target.value),
                      onKeyDown,
                      placeholder: t('panel.placeholder'),
                      rows: 2,
                      style: {
                        flex: 1,
                        resize: 'none',
                        borderRadius: 8,
                        border: '1px solid var(--dsw-alias-border-l1)',
                        background: 'var(--dsw-alias-bg-base)',
                        color: 'var(--dsw-alias-label-primary)',
                        padding: '6px 8px',
                        fontSize: 12,
                        lineHeight: '18px',
                        font: 'inherit',
                        outline: 'none',
                      },
                    }),
                    h('button', {
                      type: 'button',
                      onClick: send,
                      disabled: busy || draft.trim() === '',
                      style: {
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: 'none',
                        background: busy || draft.trim() === '' ? 'var(--dsw-alias-bg-layer-2)' : 'var(--dsw-alias-brand-primary)',
                        color: busy || draft.trim() === '' ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-bg-base)',
                        cursor: busy || draft.trim() === '' ? 'default' : 'pointer',
                        font: 'inherit',
                        fontSize: 12,
                        fontWeight: 600,
                      },
                    }, busy ? t('panel.loading') : t('panel.send')),
                  ),
                ),
              )
            : null,
          h('button', {
            type: 'button',
            onClick: () => (open ? setOpen(false) : openPanel()),
            'aria-expanded': open,
            'aria-label': t('fab.label'),
            title: t('fab.label'),
            style: fabStyle,
          },
            h('svg', {
              viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true,
              fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round',
            },
              h('path', { d: 'M12 5v14M5 12h14' }),
            ),
          ),
        );
      };
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'quick-chat: dictionaries');
        const t = ctx.locale.bind(NS);
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'quick-chat',
          order: 60,
        }, makePanel(t, ctx)));
      },
    };
  },
});
