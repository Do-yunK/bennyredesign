// Phraseboard Keyboard logic: scanning, Arduino input, navigation
document.addEventListener('DOMContentLoaded', () => {
  // Keyboard scanning state
  let currentRow = 0;
  let currentCol = 0;
  let inRowScan = true;
  let scanInterval = 1200; // ms
  let scanTimer = null;
  const rows = Array.from(document.querySelectorAll('.keyboard-row'));
  const keys = rows.map(row => Array.from(row.querySelectorAll('.key')));

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
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
  }

  function startColScan() {
    inRowScan = false;
    highlightKey(currentRow, currentCol);
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = null;
  }

  function selectCurrent() {
    if (inRowScan) {
      // Go to column scan for this row
      clearInterval(scanTimer);
      startColScan();
    } else {
      // Activate key
      const key = keys[currentRow][currentCol];
      key.click();
      // Return to row scan
      clearInterval(scanTimer);
      startRowScan();
    }
  }

  // Arduino input simulation: right = scan, left = select
  document.addEventListener('keydown', (e) => {
    // Spacebar or Arduino right: scan
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
    // Enter/Return or Arduino left: select
    else if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowLeft') {
      e.preventDefault();
      selectCurrent();
    }
  });

  // Key actions
  document.querySelectorAll('.key').forEach(key => {
    key.addEventListener('click', (e) => {
      const label = key.textContent.trim();
      if (label === 'EXIT') {
        window.location.href = '../phraseboard/index.html';
      } else if (label === 'CLEAR') {
        // TODO: Clear text bar
      } else if (label === 'SPACE') {
        // TODO: Add space to text bar
      } else if (label === '⌫') {
        // TODO: Delete last character
      } else if (label === '⚙️') {
        // TODO: Open settings
      } else if (label === '😀') {
        // TODO: Emoji picker
      } else {
        // TODO: Add letter to text bar
      }
    });
  });

  // Initialize highlight on first row
  highlightRow(currentRow);
});
