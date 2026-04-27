// add-word-keyboard.js
// Loads the phraseboard keyboard UI and adds an 'Add Word' key for adding a phrase to the current category.


// Dynamically load and initialize the keyboard logic after DOM is ready and keyboard is injected

document.addEventListener('DOMContentLoaded', () => {
  // Clone the keyboard UI from phraseboard-keyboard/index.html
  fetch('../phraseboard-keyboard/index.html')
    .then(r => r.text())
    .then(html => {
      // Extract the keyboard-main div and emoji menu
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      const keyboardContainer = document.getElementById('keyboard-container');
      const keyboardMain = doc.querySelector('.keyboard-main');
      const emojiMenu = doc.getElementById('emoji-radial-menu');
      const textBar = doc.querySelector('.textbar-container');
      const predictBar = doc.querySelector('.predict-bar');
      if (keyboardMain && emojiMenu && textBar && predictBar) {
        keyboardContainer.appendChild(emojiMenu);
        keyboardContainer.appendChild(textBar);
        keyboardContainer.appendChild(predictBar);
        keyboardContainer.appendChild(keyboardMain);
        // Add the 'Add Word' key to the last row
        const lastRow = keyboardMain.querySelector('.keyboard-row-4');
        if (lastRow) {
          const addWordBtn = document.createElement('button');
          addWordBtn.className = 'key addword';
          addWordBtn.textContent = 'ADD WORD';
          addWordBtn.setAttribute('aria-label', 'Add Word');
          addWordBtn.setAttribute('tabindex', '0');
          lastRow.appendChild(addWordBtn);
          // Now that the DOM is ready, load and run the keyboard logic so scanning works
          const script = document.createElement('script');
          script.src = '../phraseboard-keyboard/app.js';
          script.onload = () => {
            // Optionally, you could trigger a custom event if needed
          };
          document.body.appendChild(script);
        }
      }
    });
});
