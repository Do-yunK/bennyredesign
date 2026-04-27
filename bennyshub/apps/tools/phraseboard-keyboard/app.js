// Phraseboard Keyboard logic: scanning, Arduino input, navigation

// --- Predictive Text System ---
class PredictionSystem {
  constructor() {
    this.data = { frequent_words: {}, bigrams: {}, trigrams: {} };
    this.dataLoaded = false;
    this.loadBaseData();
  }
  async loadBaseData() {
    try {
      const response = await fetch('../keyboard/web_keyboard_predictions.json');
      if (response.ok) {
        this.data = await response.json();
      }
      this.dataLoaded = true;
    } catch {
      this.data = { frequent_words: {}, bigrams: {}, trigrams: {} };
    }
  }
  calculateScore(data) {
    const count = data.count || 0;
    const lastUsed = data.last_used ? new Date(data.last_used) : new Date(0);
    const daysSinceUse = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
    let recencyMultiplier;
    if (daysSinceUse < 1) recencyMultiplier = 1000;
    else if (daysSinceUse < 7) recencyMultiplier = 100;
    else if (daysSinceUse < 30) recencyMultiplier = 10;
    else if (daysSinceUse < 90) recencyMultiplier = 1;
    else recencyMultiplier = 0.1;
    return count * recencyMultiplier;
  }
  async getHybridPredictions(buffer) {
    if (!this.dataLoaded) return ["YES", "NO", "HELP", "THE", "I", "YOU"];
    const hasTrailingSpace = buffer.replace('|', '').endsWith(' ');
    const cleaned = buffer.toUpperCase().replace('|', '').trim();
    const words = cleaned ? cleaned.split(' ') : [];
    const DEFAULT_WORDS = ["YES", "NO", "HELP", "THE", "I", "YOU"];
    if (!words.length) return DEFAULT_WORDS;
    let context = '', currentWord = '';
    if (hasTrailingSpace) { context = cleaned; currentWord = ''; }
    else { currentWord = words[words.length - 1]; context = words.slice(0, -1).join(' '); }
    const existingWords = new Set(words.map(w => w.toUpperCase()));
    let finalPredictions = [];
    const shouldExcludeWord = (word) => { const upperWord = word.toUpperCase(); if (hasTrailingSpace && existingWords.has(upperWord)) return true; return false; };
    const predictionsNgram = {};
    if (context) {
      const ctxWords = context.split(' ');
      if (ctxWords.length >= 2) {
        const triCtx = ctxWords.slice(-2).join(' ');
        for (const [key, data] of Object.entries(this.data.trigrams || {})) {
          const trigramParts = key.split(' ');
          if (trigramParts.length === 3) {
            const trigramContext = trigramParts.slice(0, 2).join(' ');
            const nextWord = trigramParts[2];
            if (trigramContext === triCtx) {
              if ((!currentWord || nextWord.startsWith(currentWord)) && !shouldExcludeWord(nextWord)) {
                const score = this.calculateScore(data) * 100;
                predictionsNgram[nextWord] = (predictionsNgram[nextWord] || 0) + score;
              }
            }
          }
        }
      }
      if (ctxWords.length === 2 && hasTrailingSpace) {
        const exactContext = ctxWords.join(' ');
        for (const [key, data] of Object.entries(this.data.trigrams || {})) {
          if (key.startsWith(exactContext + ' ')) {
            const nextWord = key.split(' ').pop();
            if (nextWord && !shouldExcludeWord(nextWord)) {
              const score = this.calculateScore(data) * 100;
              predictionsNgram[nextWord] = (predictionsNgram[nextWord] || 0) + score;
            }
          }
        }
      }
      if (ctxWords.length >= 1) {
        const biCtx = ctxWords[ctxWords.length - 1];
        for (const [key, data] of Object.entries(this.data.bigrams || {})) {
          if (key.startsWith(biCtx + ' ')) {
            const parts = key.split(' ');
            if (parts.length === 2 && parts[0] === biCtx) {
                const nextWord = parts[1];
                if ((!currentWord || nextWord.startsWith(currentWord)) && !shouldExcludeWord(nextWord)) {
                  const score = this.calculateScore(data) * 50;
                  predictionsNgram[nextWord] = (predictionsNgram[nextWord] || 0) + score;
                }
            }
          }
        }
      }
    }
    const sortedNgrams = Object.entries(predictionsNgram).sort((a, b) => b[1] - a[1]).map(([word]) => word);
    for (const word of sortedNgrams) {
      if (finalPredictions.length < 6 && !finalPredictions.includes(word)) {
        finalPredictions.push(word);
      }
    }
    if (currentWord && currentWord.length >= 1 && finalPredictions.length < 6) {
      const otherMatches = Object.entries(this.data.frequent_words || {}).filter(([word, data]) => {
        return word.startsWith(currentWord) && word !== currentWord && !finalPredictions.includes(word) && !shouldExcludeWord(word);
      }).sort((a, b) => this.calculateScore(b[1]) - this.calculateScore(a[1])).map(([word]) => word);
      for (const word of otherMatches) {
        if (finalPredictions.length < 6 && !finalPredictions.includes(word)) {
          finalPredictions.push(word);
        }
      }
    }
    if (finalPredictions.length < 6) {
      for (const word of DEFAULT_WORDS) {
        if (!finalPredictions.includes(word)) finalPredictions.push(word);
        if (finalPredictions.length >= 6) break;
      }
    }
    return finalPredictions.slice(0, 6);
  }
}

function initializePhraseboardKeyboardScanning() {
      // --- Text to Speech ---
      function speak(text) {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utter = new window.SpeechSynthesisUtterance(text);
        utter.rate = 1.0;
        window.speechSynthesis.speak(utter);
      }

    // Radial emoji menu logic
    const emojiRadialMenu = document.getElementById('emoji-radial-menu');
    const emojiRadialOptions = Array.from(document.querySelectorAll('.emoji-radial-option'));
    const closeEmojiRadial = document.getElementById('close-emoji-radial');
    let emojiRadialOpen = false;
    let emojiRadialIndex = 0;
  // Keyboard scanning state
  let currentRow = 0;
  let currentCol = 0;
  let inRowScan = true;
  // Predict bar as first row for scanning
  let rows = [];
  let keys = [];
  function updateRowsAndKeys() {
    const predictBtns = Array.from(document.querySelectorAll('.predict-btn'));
    const keyboardRows = Array.from(document.querySelectorAll('.keyboard-row'));
    rows = [predictBtns, ...keyboardRows];
    keys = [predictBtns, ...keyboardRows.map(row => Array.from(row.querySelectorAll('.key')))];
  }
  updateRowsAndKeys();

  // If already initialized, don't double-bind events
  if (window.__phraseboardKeyboardScanInit) return;
  window.__phraseboardKeyboardScanInit = true;
  const textBar = document.getElementById('textBar');
  const predictBar = document.getElementById('predictBar');
  const emojiPicker = document.getElementById('emoji-picker');
  const closeEmojiPicker = document.getElementById('close-emoji-picker');
  let buffer = '';
  let predictionSystem = new PredictionSystem();

  function updateTextBar() {
    textBar.textContent = buffer + '|';
  }

  async function updatePredictions() {
    const predictions = await predictionSystem.getHybridPredictions(buffer);
    predictBar.innerHTML = '';
    predictions.forEach((word, idx) => {
      const btn = document.createElement('button');
      btn.className = 'predict-btn';
      btn.textContent = word;
      btn.onclick = () => {
        // Add prediction to buffer
        if (!buffer.endsWith(' ') && buffer.length > 0) buffer += ' ';
        buffer += word + ' ';
        updateTextBar();
        updatePredictions();
        // After selecting a prediction, resume scanning at first keyboard row
        currentRow = 1;
        currentCol = 0;
        inRowScan = true;
        highlightRow(currentRow);
      };
      predictBar.appendChild(btn);
    });
    updateRowsAndKeys();
  }

  function addLetter(letter) {
    buffer += letter;
    updateTextBar();
    updatePredictions();
  }
    // (Removed duplicate emoji key override handler here)
  function addSpace() {
    buffer += ' ';
    updateTextBar();
    updatePredictions();
  }
  function backspace() {
    // Remove last grapheme cluster (full emoji or char)
    if (buffer.length > 0) {
      // Use Intl.Segmenter if available for robust emoji deletion
      if (window.Intl && Intl.Segmenter) {
        const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
        const segments = Array.from(segmenter.segment(buffer));
        if (segments.length > 1) {
          buffer = segments.slice(0, -1).map(s => s.segment).join('');
        } else {
          buffer = '';
        }
      } else {
        // Fallback: remove last code point
        const code = buffer.codePointAt(buffer.length - 1);
        if (code > 0xffff) {
          buffer = buffer.slice(0, -2);
        } else {
          buffer = buffer.slice(0, -1);
        }
      }
      updateTextBar();
      updatePredictions();
    }
  }
  function clearText() {
    buffer = '';
    updateTextBar();
    updatePredictions();
  }

  function highlightRow(rowIdx) {
    rows.forEach((row, i) => {
      if (Array.isArray(row)) {
        // predict bar
        row.forEach(btn => btn.classList.remove('active'));
        if (i === rowIdx) {
          predictBar.classList.add('scanning');
        } else {
          predictBar.classList.remove('scanning');
        }
      } else {
        row.style.boxShadow = i === rowIdx ? '0 0 0 4px #ff6b35' : '';
      }
    });
    keys.forEach((row, i) => row.forEach(key => key.classList.remove('active')));
  }
  function highlightKey(rowIdx, colIdx) {
        // Speak the label of the key or prediction when scanning
        let label = '';
        if (rowIdx === 0 && keys[0][colIdx]) {
          label = keys[0][colIdx].textContent.trim();
        } else if (keys[rowIdx] && keys[rowIdx][colIdx]) {
          label = keys[rowIdx][colIdx].textContent.trim();
        }
        if (label) speak(label);
    highlightRow(-1);
    keys.forEach(row => row.forEach(key => key.classList.remove('active')));
    if (rowIdx === 0 && keys[0][colIdx]) {
      keys[0][colIdx].classList.add('active');
    } else if (keys[rowIdx] && keys[rowIdx][colIdx]) {
      keys[rowIdx][colIdx].classList.add('active');
    }
  }
  function startRowScan() {
    inRowScan = true;
    currentCol = 0;
    highlightRow(currentRow);
  }
  function startColScan() {
    inRowScan = false;
    highlightKey(currentRow, currentCol);
  }
  function selectCurrent() {
    if (inRowScan) {
      startColScan();
    } else {
      const key = keys[currentRow][currentCol];
      key.click();
      startRowScan();
    }
  }
  function highlightEmojiRadial() {
    emojiRadialOptions.forEach((btn, idx) => {
      if (idx === emojiRadialIndex) {
        btn.style.outline = '4px solid #5bb0ff';
        btn.style.zIndex = 2;
      } else {
        btn.style.outline = '';
        btn.style.zIndex = '';
      }
    });
    if (closeEmojiRadial) {
      if (emojiRadialIndex === emojiRadialOptions.length) {
        closeEmojiRadial.style.outline = '4px solid #5bb0ff';
        closeEmojiRadial.style.zIndex = 2;
      } else {
        closeEmojiRadial.style.outline = '';
        closeEmojiRadial.style.zIndex = '';
      }
    }
  }
  function unhighlightEmojiRadial() {
    emojiRadialOptions.forEach(btn => {
      btn.style.outline = '';
      btn.style.zIndex = '';
    });
    if (closeEmojiRadial) {
      closeEmojiRadial.style.outline = '';
      closeEmojiRadial.style.zIndex = '';
    }
  }
  document.addEventListener('keydown', (e) => {
    if (emojiRadialOpen) {
      // Scan through emoji radial menu
      if (e.code === 'Space' || e.code === 'ArrowRight') {
        e.preventDefault();
        emojiRadialIndex = (emojiRadialIndex + 1) % (emojiRadialOptions.length + 1);
        highlightEmojiRadial();
      } else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowLeft') {
        e.preventDefault();
        if (emojiRadialIndex < emojiRadialOptions.length) {
          emojiRadialOptions[emojiRadialIndex].click();
        } else {
          closeEmojiRadial.click();
        }
      }
      return;
    }
    // Normal keyboard scan
    if (e.code === 'Space' || e.code === 'ArrowRight') {
      e.preventDefault();
      if (inRowScan) {
        currentRow = (currentRow + 1) % rows.length;
        highlightRow(currentRow);
      } else {
        currentCol = (currentCol + 1) % keys[currentRow].length;
        highlightKey(currentRow, currentCol);
      }
    }
    else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowLeft') {
      e.preventDefault();
      selectCurrent();
    }
  });
  document.querySelectorAll('.key').forEach(key => {
    key.addEventListener('click', (e) => {
      // Speak the label when selected
      let label = key.textContent.trim();
      if (label) speak(label);
      // Prevent emoji key from adding emoji to buffer
      if (key.classList.contains('emoji')) {
        e.preventDefault();
        emojiRadialMenu.style.display = 'block';
        emojiRadialOpen = true;
        emojiRadialIndex = 0;
        highlightEmojiRadial();
        return;
      }
      // Read aloud button
      if (key.classList.contains('readaloud')) {
        e.preventDefault();
        speak(buffer);
        return;
      }
      // ADD WORD button logic
      if (key.classList.contains('addword')) {
        e.preventDefault();
        const text = textBar.textContent.replace(/\|/g, '').trim();
        if (text) {
          // Get category and board from URL params (like old keyboard)
          const params = new URLSearchParams(window.location.search);
          const category = params.get('category') || '';
          const board = params.get('board') || '';
          const PHRASEBOARD_ADD_WORD_RETURN_KEY = 'phraseboard_pending_add_word';
          sessionStorage.setItem(PHRASEBOARD_ADD_WORD_RETURN_KEY, JSON.stringify({
            word: text,
            category,
            board,
            ts: Date.now()
          }));
          // Instead of closing the window, return to the category page
          window.location.href = `../phraseboard/index.html?category=${encodeURIComponent(category)}`;
        }
        return;
      }
      // For SVG delete key, check aria-label or visually hidden span
      if (key.classList.contains('delete')) {
        label = '⌫';
      }
      if (label === 'EXIT') {
        window.location.href = '../phraseboard/index.html';
      } else if (label === 'CLEAR') {
        clearText();
      } else if (label === 'SPACE') {
        addSpace();
      } else if (label === '⌫') {
        backspace();
      } else {
        addLetter(label);
      }
    });
  });

  // Emoji/settings button (row 4)
  const emojiKeyBtn = document.querySelector('.key.emoji');
  if (emojiKeyBtn) {
    emojiKeyBtn.addEventListener('click', () => {
      emojiRadialMenu.style.display = 'block';
      emojiRadialOpen = true;
      emojiRadialIndex = 0;
      highlightEmojiRadial();
    });
  }
  if (closeEmojiRadial) {
    closeEmojiRadial.addEventListener('click', () => {
      emojiRadialMenu.style.display = 'none';
      emojiRadialOpen = false;
      unhighlightEmojiRadial();
    });
  }
  emojiRadialOptions.forEach((btn, idx) => {
    btn.addEventListener('click', (e) => {
      const emoji = btn.getAttribute('data-emoji');
      buffer += emoji;
      updateTextBar();
      updatePredictions();
      emojiRadialMenu.style.display = 'none';
      emojiRadialOpen = false;
      unhighlightEmojiRadial();
    });
  });
  // Initialize
  highlightRow(currentRow);
  updateTextBar();
  updatePredictions();
}

// Support both static and dynamic loading
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializePhraseboardKeyboardScanning);
} else {
  initializePhraseboardKeyboardScanning();
}
