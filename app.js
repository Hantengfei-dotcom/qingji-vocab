const $ = id => document.getElementById(id);
const storeKey = 'qingji-vocab-progress-v1';
const state = {
  books: { cet: [], ielts: [] },
  chapters: [],
  book: 'cet', chapter: 'all', mode: 'card', query: '',
  list: [], index: 0, revealed: false, quiz: null, spell: null,
  progress: { cet: {}, ielts: {} }
};

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey) || '{}');
    for (const id of ['cet', 'ielts']) {
      if (saved[id] && typeof saved[id] === 'object' && !Array.isArray(saved[id])) {
        state.progress[id] = saved[id];
      }
    }
  } catch (_) { /* The site remains usable if storage is unavailable. */ }
}

function saveProgress() {
  try { localStorage.setItem(storeKey, JSON.stringify(state.progress)); } catch (_) {}
}

function keyFor(entry) { return String(entry.w || '').trim().toLowerCase(); }
function mastered(entry) { return !!state.progress[state.book][keyFor(entry)]; }
function markMastered(entry) {
  state.progress[state.book][keyFor(entry)] = 1;
  saveProgress();
  updateProgress();
}

function updateProgress() {
  const words = state.books[state.book];
  const keys = new Set(words.map(keyFor));
  let done = 0;
  for (const key of keys) if (state.progress[state.book][key]) done++;
  $('progress-number').textContent = `${done.toLocaleString()} / ${keys.size.toLocaleString()}`;
  $('progress-fill').style.width = keys.size ? `${done / keys.size * 100}%` : '0%';
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, className, action) {
  const node = make('button', className, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function speak(text) {
  if (!text || !('speechSynthesis' in window)) {
    alert('当前浏览器不支持语音朗读，请换用 Chrome、Edge 或 Safari。');
    return;
  }
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.88;
  utterance.volume = 1;
  const voices = speechSynthesis.getVoices();
  utterance.voice = voices.find(v => /^en[-_]/i.test(v.lang)) || null;
  speechSynthesis.speak(utterance);
}

function visibleList() {
  const query = state.query.trim().toLowerCase();
  let words = state.books[state.book];
  if (state.book === 'ielts' && state.chapter !== 'all') {
    words = words.filter(entry => entry.chapter === state.chapter);
  }
  if (query) words = words.filter(entry =>
    String(entry.w || '').toLowerCase().includes(query) ||
    String(entry.m || '').toLowerCase().includes(query)
  );
  return words;
}

function resetQuestion() { state.revealed = false; state.quiz = null; state.spell = null; }
function refreshList() {
  state.list = visibleList();
  state.index = 0;
  resetQuestion();
  render();
}

function addPronunciation(parent, entry) {
  const top = make('div', 'word-top');
  top.append(make('h2', 'word', entry.w));
  top.append(button('🔊', 'speak-button', () => speak(entry.w)));
  top.lastChild.setAttribute('aria-label', `朗读 ${entry.w}`);
  parent.append(top);
  if (entry.ph) parent.append(make('p', 'phonetic', entry.ph));
}

function addAnswer(parent, entry) {
  const answer = make('div', 'answer');
  answer.append(make('p', 'meaning', `${entry.pos ? entry.pos + ' ' : ''}${entry.m || '暂无释义'}`));
  if (entry.ex) {
    const example = make('p', 'example', entry.ex);
    example.title = '点击朗读例句';
    example.style.cursor = 'pointer';
    example.addEventListener('click', () => speak(entry.ex));
    answer.append(example);
  }
  if (entry.ez) answer.append(make('p', 'example-zh', entry.ez));
  parent.append(answer);
}

function renderCard(parent, entry) {
  addPronunciation(parent, entry);
  if (entry.chapter) parent.append(make('span', 'word-meta', entry.chapter));
  if (!state.revealed) {
    parent.append(button('显示词义与例句', 'reveal-button', () => { state.revealed = true; render(); }));
    return;
  }
  addAnswer(parent, entry);
  const actions = make('div', 'card-actions');
  actions.append(button(mastered(entry) ? '✓ 已掌握' : '认识，记住了', 'action-button', () => { markMastered(entry); render(); }));
  actions.append(button('再看一遍', 'action-button secondary', () => { state.revealed = false; render(); }));
  parent.append(actions);
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getQuiz(entry) {
  if (state.quiz) return state.quiz;
  const used = new Set([entry.m]);
  const others = shuffled(state.books[state.book]).filter(candidate => {
    if (!candidate.m || used.has(candidate.m) || keyFor(candidate) === keyFor(entry)) return false;
    used.add(candidate.m);
    return true;
  }).slice(0, 3);
  state.quiz = { choices: shuffled([entry, ...others]), selected: null };
  return state.quiz;
}

function renderQuiz(parent, entry) {
  parent.append(make('p', 'prompt', '选择这个单词的正确词义'));
  addPronunciation(parent, entry);
  const quiz = getQuiz(entry);
  const choices = make('div', 'choices');
  quiz.choices.forEach((choice, i) => {
    const selected = quiz.selected !== null;
    const item = button(choice.m || '暂无释义', 'choice', () => {
      quiz.selected = i;
      if (keyFor(choice) === keyFor(entry)) markMastered(entry);
      render();
    });
    item.disabled = selected;
    if (selected && keyFor(choice) === keyFor(entry)) item.classList.add('correct');
    else if (selected && i === quiz.selected) item.classList.add('incorrect');
    choices.append(item);
  });
  parent.append(choices);
  if (quiz.selected !== null) {
    const correct = keyFor(quiz.choices[quiz.selected]) === keyFor(entry);
    parent.append(make('p', `feedback ${correct ? 'good' : 'bad'}`, correct ? '答对了，已记入掌握进度。' : `再记一次：${entry.m}`));
    if (entry.ex) parent.append(make('p', 'example', entry.ex));
  }
}

function renderSpell(parent, entry) {
  parent.append(make('p', 'prompt', '根据词义拼写英文单词'));
  parent.append(make('p', 'meaning', `${entry.pos ? entry.pos + ' ' : ''}${entry.m || '暂无释义'}`));
  if (entry.chapter) parent.append(make('span', 'word-meta', entry.chapter));
  const form = make('form', 'spell-form');
  const input = make('input');
  input.type = 'text';
  input.placeholder = '在这里输入英文单词';
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.spellcheck = false;
  input.setAttribute('aria-label', '拼写英文单词');
  input.disabled = state.spell !== null;
  const submit = make('button', 'action-button', '检查拼写');
  submit.type = 'submit';
  submit.disabled = state.spell !== null;
  form.append(input, submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    const answer = input.value.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!answer) return;
    const correct = answer === keyFor(entry);
    state.spell = { correct };
    if (correct) markMastered(entry);
    render();
  });
  parent.append(form);
  if (state.spell) {
    parent.append(make('p', `feedback ${state.spell.correct ? 'good' : 'bad'}`,
      state.spell.correct ? '拼对了，已记入掌握进度。' : `正确拼写：${entry.w}`));
    if (entry.ex) parent.append(make('p', 'example', entry.ex));
    parent.append(button('🔊 听发音', 'action-button secondary', () => speak(entry.w)));
  }
}

function render() {
  updateProgress();
  const labels = { cet: '大学英语四六级', ielts: '雅思词汇' };
  const scope = state.book === 'ielts' && state.chapter !== 'all' ? state.chapter : '全部词汇';
  $('session-label').textContent = `${labels[state.book]} · ${scope} · ${state.list.length.toLocaleString()} 词`;
  $('position-label').textContent = state.list.length ? `${state.index + 1} / ${state.list.length}` : '';
  const parent = $('exercise');
  parent.replaceChildren();
  parent.classList.toggle('empty', !state.list.length);
  $('previous-button').disabled = !state.list.length || state.index === 0;
  $('next-button').disabled = !state.list.length || state.index === state.list.length - 1;
  if (!state.list.length) {
    parent.append(make('p', '', state.query ? '没有找到匹配的单词，试试别的关键词。' : '这个范围暂时没有单词。'));
    return;
  }
  const entry = state.list[state.index];
  if (state.mode === 'card') renderCard(parent, entry);
  if (state.mode === 'quiz') renderQuiz(parent, entry);
  if (state.mode === 'spell') renderSpell(parent, entry);
}

function move(delta) {
  const next = state.index + delta;
  if (next < 0 || next >= state.list.length) return;
  state.index = next;
  resetQuestion();
  render();
}

function setBook(id) {
  state.book = id;
  state.chapter = 'all';
  state.query = '';
  state.mode = 'card';
  $('search-input').value = '';
  $('chapter-select').value = 'all';
  $('chapter-wrap').hidden = id !== 'ielts';
  document.querySelectorAll('.book-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.book === id));
  document.querySelectorAll('.mode-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.mode === 'card'));
  refreshList();
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({ version: 1, progress: state.progress }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = '轻记单词-学习进度.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProgress(file) {
  if (!file) return;
  if (file.size > 2_000_000) { alert('进度文件过大。'); return; }
  try {
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !data.progress || typeof data.progress !== 'object') throw new Error('format');
    for (const id of ['cet', 'ielts']) {
      const incoming = data.progress[id];
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) continue;
      for (const entry of state.books[id]) {
        const key = keyFor(entry);
        if (Object.prototype.hasOwnProperty.call(incoming, key) && incoming[key] === 1) state.progress[id][key] = 1;
      }
    }
    saveProgress();
    render();
    alert('进度已导入。');
  } catch (_) { alert('无法读取这个进度文件。'); }
  $('import-input').value = '';
}

async function start() {
  loadProgress();
  document.querySelectorAll('.book-tab').forEach(tab => tab.addEventListener('click', () => setBook(tab.dataset.book)));
  document.querySelectorAll('.mode-tab').forEach(tab => tab.addEventListener('click', () => {
    state.mode = tab.dataset.mode;
    resetQuestion();
    document.querySelectorAll('.mode-tab').forEach(item => item.classList.toggle('active', item === tab));
    render();
  }));
  $('chapter-select').addEventListener('change', event => { state.chapter = event.target.value; refreshList(); });
  $('search-input').addEventListener('input', event => { state.query = event.target.value; refreshList(); });
  $('random-button').addEventListener('click', () => {
    if (!state.list.length) return;
    state.index = Math.floor(Math.random() * state.list.length);
    resetQuestion();
    render();
  });
  $('previous-button').addEventListener('click', () => move(-1));
  $('next-button').addEventListener('click', () => move(1));
  $('export-button').addEventListener('click', exportProgress);
  $('import-input').addEventListener('change', event => importProgress(event.target.files[0]));
  document.addEventListener('keydown', event => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (event.key === 'ArrowRight') move(1);
    if (event.key === 'ArrowLeft') move(-1);
  });
  try {
    const [cetResponse, ieltsResponse] = await Promise.all([fetch('cet.json'), fetch('ielts-chapters.json')]);
    if (!cetResponse.ok || !ieltsResponse.ok) throw new Error('data unavailable');
    state.books.cet = await cetResponse.json();
    state.chapters = await ieltsResponse.json();
    state.books.ielts = state.chapters.flatMap(chapter => chapter.words.map(entry => ({ ...entry, chapter: chapter.title })));
    const select = $('chapter-select');
    state.chapters.forEach(chapter => {
      const option = document.createElement('option');
      option.value = chapter.title;
      option.textContent = `${chapter.title} · ${chapter.words.length} 词`;
      select.append(option);
    });
    $('cet-count').textContent = `${state.books.cet.length.toLocaleString()} 词`;
    $('ielts-count').textContent = `${state.books.ielts.length.toLocaleString()} 词`;
    setBook('cet');
  } catch (_) {
    $('session-label').textContent = '词库载入失败';
    $('exercise').classList.add('empty');
    $('exercise').textContent = '请刷新页面重试。如果是在本地打开文件，请通过 GitHub Pages 链接访问。';
  }
}

start();
