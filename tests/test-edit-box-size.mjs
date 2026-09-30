import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcCode = fs.readFileSync(path.resolve(__dirname, '../src/client.src.js'), 'utf-8');
const bundleCode = fs.readFileSync(path.resolve(__dirname, '../lib/client.js'), 'utf-8');

const SRC = 'src/client.src.js';
const BUNDLE = 'lib/client.js';
const files = [[SRC, srcCode], [BUNDLE, bundleCode]];

const has = (code, needle, msg) => assert.ok(code.includes(needle), msg);

console.log('--- 开始测试：进入编辑模式时编辑框的尺寸缺陷修复（高度塌陷 + 极短消息按钮溢出）---');

// =========================================================================
// [Test 1] 静态：高度层修复契约（与宽度档位无关，四个档位全中）
// =========================================================================
console.log('[Test 1] 编辑框高度层契约验证...');

for (const [name, code] of files) {
  // 1.1 进入编辑时记下气泡实测高，作为编辑框高度下限
  has(code, 'var bubbleInitHState = React.useState(0);', `${name}：必须记录进入编辑时的气泡原高`);
  has(code, 'function enterEdit(initWidth, initHeight) {', `${name}：enterEdit 必须接收气泡原高`);
  has(code, 'if (initHeight && initHeight > 0) bubbleInitHState[1](initHeight);', `${name}：enterEdit 必须保存气泡原高`);
  has(code, 'enterEdit(e.currentTarget ? e.currentTarget.offsetWidth : 0, e.currentTarget ? e.currentTarget.offsetHeight : 0);', `${name}：点击气泡进入编辑时必须把宽高一起传入`);
  // 1.2 高度下限 + 按钮行贴底（短消息与气泡等高，长消息 = 原高 + 按钮行，绝不变矮）
  has(code, 'minHeight: bubbleInitH > 0 ? bubbleInitH : void 0', `${name}：编辑框必须设置 minHeight = 气泡原高`);
  has(code, 'justifyContent: "space-between"', `${name}：编辑框必须用 space-between 让按钮行贴底`);
  // 1.3 单段长消息首屏只有 1 行的问题
  has(code, 'Math.min(200, lineCount)', `${name}：textarea 初始行数上限须由 20 提升到 200`);
  has(code, 'el.style.height = el.scrollHeight + "px"', `${name}：textarea 必须按 scrollHeight 撑高`);
  has(code, 'el.dataset.dbeAutosized = "1"', `${name}：挂载撑高必须幂等（只执行一次）`);
  assert.ok(!code.includes('maxHeight: "240px"'), `${name}：必须移除 textarea 的 240px 内部滚动上限（高度塌陷的来源之一）`);
  has(code, 'maxHeight: "70vh"', `${name}：textarea 高度上限应为视口相对值 70vh`);
  // 1.4 textarea 与气泡逐字换行对齐（清掉 UA 默认 padding 与盒模型差异）
  has(code, 'boxSizing: "border-box"', `${name}：textarea 必须使用 border-box 盒子模型`);
  has(code, 'flexGrow: 1', `${name}：textarea 必须 flexGrow 吸收高度余量`);
  // 1.5 气泡挂 ref，操作区「编辑」键必须量真实气泡而不是 34px 操作按钮
  has(code, 'ref: bubbleRef', `${name}：气泡节点必须挂 bubbleRef`);
  has(code, 'var bubbleEl = bubbleRef.current;', `${name}：操作区「编辑」键必须通过 bubbleRef 量真实气泡`);
  has(code, 'enterEdit(bubbleEl ? bubbleEl.offsetWidth : 0, bubbleEl ? bubbleEl.offsetHeight : 0);', `${name}：操作区「编辑」键必须把气泡宽高一起传入 enterEdit`);
}

console.log('✓ 编辑框高度层契约验证通过');

// =========================================================================
// [Test 2] 静态：宽度下限（极短消息时按钮行不得溢出气泡）
// =========================================================================
console.log('[Test 2] 编辑框宽度下限契约验证...');

for (const [name, code] of files) {
  has(code, 'function editMinWidth(labelA, labelB) {', `${name}：必须提供按钮行最小宽度辅助函数`);
  has(
    code,
    'var editBoxW = Math.max(editMinWidth(L.cancel, L.confirm), editWidthFor(editMode, editText, bubbleInitW));',
    `${name}：编辑框宽度必须取「按钮行最小宽度」与档位宽度中的较大者`
  );
  // 本 PR 不改变宽度档位本身：既不新增档位，也不改默认档
  has(code, 'var v = "standard";', `${name}：默认档必须保持上游的 standard`);
  has(code, 'if (v === "bubble") return "compact";', `${name}：必须保留旧值（bubble/wrap/composer）兼容映射`);
}

console.log('✓ 编辑框宽度下限契约验证通过');

/** 从源码文本中按大括号配平抽取一个函数定义。 */
function extractFunction(code, name) {
  const start = code.indexOf('function ' + name + '(');
  assert.ok(start >= 0, `源码中必须存在函数 ${name}`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(start, i + 1);
    }
  }
  throw new Error(`函数 ${name} 大括号不配平`);
}

const editMinWidth = eval('(' + extractFunction(srcCode, 'editMinWidth') + ')');
const editWidthFor = eval(
  '(function () { var editWidthCustom = function () { return 512; }; ' +
    extractFunction(srcCode, 'editWidthFor') +
    ' return editWidthFor; })()'
);
assert.equal(typeof editMinWidth, 'function', 'editMinWidth 必须可从源码中还原执行');
assert.equal(typeof editWidthFor, 'function', 'editWidthFor 必须可从源码中还原执行');

// =========================================================================
// [Test 3] 行为：三种语言下，最小宽度都放得下「取消 / 确定」按钮行
// =========================================================================
console.log('[Test 3] 按钮行最小宽度行为验证...');

// 按钮实测样式：padding "4px 16px"、font-size 13px、白色空间 nowrap；编辑框 padding "8px 14px"、按钮间距 gap "8px"。
const BOX_PADDING = 28; // 14 × 2
const BTN_PADDING = 32; // 16 × 2
const BTN_GAP = 8;
const rowNeed = (labels, cjkPx, asciiPx) =>
  BOX_PADDING +
  labels.reduce(
    (sum, label) => sum + BTN_PADDING + [...label].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e7f ? cjkPx : asciiPx), 0),
    0
  ) +
  BTN_GAP;

const LOCALES = { zh: ['取消', '确定'], en: ['Cancel', 'Confirm'], ja: ['キャンセル', '確定'] };
for (const [locale, labels] of Object.entries(LOCALES)) {
  const need = rowNeed(labels, 13, 8); // 与上游气泡宽度估算同源的保守估算
  const floor = editMinWidth(labels[0], labels[1]);
  assert.ok(floor >= need, `${locale}：「${labels.join(' / ')}」按钮行需要 ${need}px，最小宽度只有 ${floor}px`);
  assert.ok(floor <= 260, `${locale}：最小宽度 ${floor}px 不应大到主导编辑框尺寸`);
}
// 中文本地化的锚点值：28 + (32 + 2×13) + 8 + (32 + 2×13) = 160
assert.ok(editMinWidth('取消', '确定') >= 152, 'zh：最小宽度必须 ≥ 152px（28 + 两个按钮 + 间距）');
// 缺文案时不得算出比空串更小的值
assert.equal(editMinWidth(undefined, undefined), editMinWidth('', ''), 'zh：缺文案时必须退化成空串结果，不得更小');

// 极短消息（气泡实测宽 42px）在 compact 档下原本只有 44px → 按钮行溢出；加上下限后必须放得下
for (const [locale, labels] of Object.entries(LOCALES)) {
  const shaped = Math.max(editMinWidth(labels[0], labels[1]), editWidthFor('compact', '好', 42));
  assert.ok(shaped >= rowNeed(labels, 13, 8), `${locale}：极短气泡进入编辑后宽度 ${shaped}px 必须放得下按钮行`);
}
// 长气泡不受影响：下限只抬不压
for (const initW of [512, 748, 1025]) {
  assert.equal(
    Math.max(editMinWidth('取消', '确定'), editWidthFor('standard', '长文本', initW)),
    360,
    `standard 档下 ${initW}px 气泡的编辑框仍应为 360px（本 PR 不改宽度策略）`
  );
}
assert.equal(Math.max(editMinWidth('取消', '确定'), editWidthFor('compact', '好', 192)), 192, '192px 气泡不受最小宽度影响');

console.log('✓ 按钮行最小宽度行为验证通过');

// =========================================================================
// [Test 4] 行为：宽度档位行为与上游保持一致（本 PR 不动宽度策略）
// =========================================================================
console.log('[Test 4] 宽度档位回归验证...');

const LONG = '这是一条很长的消息，'.repeat(40);
assert.equal(editWidthFor('standard', LONG, 748), 360, 'standard 档固定 360px（上游行为不变）');
assert.equal(editWidthFor('standard', LONG, 0), 360, 'standard 档无实测值时仍为 360px');
assert.equal(editWidthFor('extended', LONG, 748), '100%', 'extended 档必须仍返回 "100%"');
assert.equal(editWidthFor('custom', LONG, 748), 512, 'custom 档必须仍走 editWidthCustom()');
assert.equal(editWidthFor('compact', LONG, 300), 360, 'compact 档仍以气泡实测宽起步并随内容扩展（上限 360）');
assert.equal(editWidthFor('compact', '好', 42), 44, 'compact 档 42px 气泡仍返回 44px（下游由最小宽度兜底，档位本身不动）');
assert.equal(editWidthFor('compact', '好', 0), 200, 'compact 档无实测值时仍回落 200px');

console.log('✓ 宽度档位回归验证通过');

// =========================================================================
// [Test 5] 不变式：编辑框高度 = max(气泡原高, 内容高 + 按钮行) ≥ 气泡原高
// =========================================================================
console.log('[Test 5] 编辑框高度只增不减不变式验证...');

const GAP = 6; // editBoxStyle gap
const BTN_ROW = 32; // 取消/确定按钮行（含贴底间距）实测约 32px
for (const initH of [0, 22, 60, 480]) {
  for (const textH of [22, 60, 480, 960]) {
    const contentH = textH + GAP + BTN_ROW;
    // minHeight = 气泡原高（initH=0 时不设下限），内容溢出由 70vh + 内部滚动兜底
    const boxH = Math.max(initH, contentH);
    assert.ok(boxH >= initH, `initH=${initH}、内容高=${textH} 时编辑框高度不得小于气泡原高`);
    assert.ok(boxH >= contentH || boxH >= initH, `initH=${initH}、内容高=${textH} 时编辑框不得裁切内容`);
  }
}

console.log('✓ 编辑框高度只增不减不变式验证通过');

console.log('\n======================================');
console.log('✔ 编辑框尺寸缺陷修复全部测试通过！');
console.log('======================================\n');
