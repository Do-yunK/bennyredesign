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

document.addEventListener('DOMContentLoaded', () => {
  // Keyboard scanning state
  let currentRow = 0;
  let currentCol = 0;
  let inRowScan = true;
  const rows = Array.from(document.querySelectorAll('.keyboard-row'));
  const keys = rows.map(row => Array.from(row.querySelectorAll('.key')));
  const textBar = document.getElementById('textBar');
  const predictBar = document.getElementById('predictBar');
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
      };
      predictBar.appendChild(btn);
    });
  }

  function addLetter(letter) {
    buffer += letter;
    updateTextBar();
    updatePredictions();
  }
  function addSpace() {
    buffer += ' ';
    updateTextBar();
    updatePredictions();
  }
  function backspace() {
    buffer = buffer.slice(0, -1);
    updateTextBar();
    updatePredictions();
  }
  function clearText() {
    buffer = '';
    updateTextBar();
    updatePredictions();
  }

  function highlightRow(rowIdx) {
    rows.forEach((row, i) => {
      row.style.boxShadow = i === rowIdx ? '0 0 0 4px #ff6b35' : '';
    });
    keys.forEach((row, i) => row.forEach(key => key.classList.remove('active')));
  }
  function highlightKey(rowIdx, colIdx) {
    highlightRow(-1);
    keys.forEach(row => row.forEach(key => key.classList.remove('active')));
    if (keys[rowIdx] && keys[rowIdx][colIdx]) {
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
  document.addEventListener('keydown', (e) => {
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
      const label = key.textContent.trim();
      if (label === 'EXIT') {
        window.location.href = '../phraseboard/index.html';
      } else if (label === 'CLEAR') {
        clearText();
      } else if (label === 'SPACE') {
        addSpace();
      } else if (label === '⌫') {
        backspace();
      } else if (label === '⚙️') {
        // Settings (not implemented)
      } else if (label === '😀') {
        // Emoji picker (not implemented)
      } else {
        addLetter(label);
      }
    });
  });
  // Initialize
  highlightRow(currentRow);
  updateTextBar();
  updatePredictions();
});
