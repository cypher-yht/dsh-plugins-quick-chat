// Unit tests for the floating-chat Markdown renderer.
// The renderer lives inline in client.js (the web client loads it as plain JS), so
// these tests extract the marked region and run it against a stub `h()`.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('// #region markdown');
const end = source.indexOf('// #endregion markdown');
assert.ok(start > 0 && end > start, 'client.js must keep the markdown region markers');

const region = source.slice(start, end);
const h = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) });
const factory = new Function('h', `${region}\nreturn { parseBlocks, inlineNodes, messageBody };`);
const { messageBody } = factory(h);

function collect(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collect(item, out);
    return out;
  }
  if (node === null || node === undefined) return out;
  if (typeof node !== 'object') {
    if (typeof node === 'string') out.push({ type: 'text', text: node });
    return out;
  }
  out.push(node);
  for (const child of node.children || []) collect(child, out);
  return out;
}

const nodes = (tree) => collect(tree);
const textOf = (tree) => nodes(tree).filter((n) => n.type === 'text').map((n) => n.text).join('');
const ofType = (tree, type) => nodes(tree).filter((n) => n.type === type);

const checks = [];
function test(name, fn) {
  try {
    fn();
    checks.push(`ok   ${name}`);
  } catch (error) {
    checks.push(`FAIL ${name}\n     ${error && error.message ? error.message : error}`);
    process.exitCode = 1;
  }
}

test('headings, emphasis, inline code, links', () => {
  const tree = messageBody('# 标题\n\n你好 **粗体**、*斜体*、~~删除~~、`code` 和 [链接](https://example.com)。', 'm1');
  assert.ok(ofType(tree, 'div').some((n) => n.props.style && n.props.style.fontWeight === 700), 'heading renders bold');
  assert.equal(ofType(tree, 'strong').length, 1, 'strong');
  assert.equal(ofType(tree, 'em').length, 1, 'em');
  assert.equal(ofType(tree, 'del').length, 1, 'strike');
  assert.equal(textOf(ofType(tree, 'code')[0]), 'code');
  const anchor = ofType(tree, 'a')[0];
  assert.equal(anchor.props.href, 'https://example.com');
  assert.equal(textOf(anchor), '链接');
});

test('fenced code keeps language label and body', () => {
  const tree = messageBody('```js\nconst a = 1;\n```', 'm2');
  const pre = ofType(tree, 'pre')[0];
  assert.ok(pre, 'pre exists');
  assert.equal(textOf(pre), 'const a = 1;');
  assert.ok(textOf(tree).includes('js'), 'language label rendered');
});

test('unclosed fence (streaming) still renders as code', () => {
  const tree = messageBody('```js\nlet a = 1', 'm3');
  assert.equal(textOf(ofType(tree, 'pre')[0]), 'let a = 1');
});

test('nested and ordered lists', () => {
  const nested = messageBody('- 第一\n  - 嵌套\n- 第二', 'm4');
  assert.equal(ofType(nested, 'ul').length, 2, 'outer + nested <ul>');
  assert.ok(textOf(nested).includes('嵌套'));

  const ordered = messageBody('2. 二\n3. 三', 'm4b');
  const ol = ofType(ordered, 'ol')[0];
  assert.equal(ol.props.start, 2, 'ordered list start');
  assert.equal(ofType(ordered, 'li').length, 2);
});

test('task list checkboxes', () => {
  const tree = messageBody('- [ ] 待办\n- [x] 完成', 'm5');
  const boxes = ofType(tree, 'input');
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].props.checked, false);
  assert.equal(boxes[1].props.checked, true);
});

test('pipe table with alignment', () => {
  const tree = messageBody('| 名称 | 数量 |\n| --- | ---: |\n| 苹果 | 3 |', 'm6');
  const table = ofType(tree, 'table')[0];
  assert.ok(table, 'table exists');
  assert.ok(textOf(table).includes('苹果'));
  assert.equal(ofType(table, 'th').length, 2);
  const cells = ofType(table, 'td');
  assert.equal(cells.length, 2);
  assert.equal(cells[1].props.style.textAlign, 'right');
});

test('blockquote and horizontal rule', () => {
  const tree = messageBody('> 引用一行\n\n---', 'm7');
  assert.equal(ofType(tree, 'blockquote').length, 1);
  assert.equal(ofType(tree, 'hr').length, 1);
});

test('unsafe link and image targets degrade to text', () => {
  const tree = messageBody('[点我](javascript:alert(1)) ![图](javascript:evil())', 'm8');
  assert.equal(ofType(tree, 'a').filter((n) => /^javascript:/i.test(String(n.props.href))).length, 0);
  assert.equal(ofType(tree, 'img').length, 0);
  assert.ok(textOf(tree).includes('点我'));
});

test('inline edge cases: backtick runs, bare url, autolink', () => {
  const tree = messageBody('看 ``a ` b`` 和 https://example.com/x 以及 <https://auto.example>', 'm9');
  assert.equal(textOf(ofType(tree, 'code')[0]), 'a ` b');
  assert.equal(ofType(tree, 'a').length, 2);
  assert.equal(ofType(tree, 'a')[0].props.href, 'https://example.com/x');
  assert.equal(ofType(tree, 'a')[1].props.href, 'https://auto.example');
});

test('soft line breaks inside a paragraph', () => {
  const tree = messageBody('第一行\n第二行', 'm10');
  assert.equal(ofType(tree, 'br').length, 1);
  assert.ok(textOf(tree).includes('第一行'));
});

test('raw HTML stays text', () => {
  const tree = messageBody('<script>alert(1)</script>', 'm11');
  assert.ok(textOf(tree).includes('<script>'), 'no HTML injection');
  assert.equal(ofType(tree, 'script').length, 0);
});

test('empty input is harmless', () => {
  assert.equal(messageBody('', 'm12'), '');
  assert.equal(messageBody(null, 'm13'), '');
});

for (const line of checks) console.log(line);
console.log(process.exitCode ? '\nFAILURES PRESENT' : '\nall markdown checks passed');
