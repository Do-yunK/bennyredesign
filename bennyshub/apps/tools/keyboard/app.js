(() => {
  const $ = (sel) => document.querySelector(sel);
  const textBar = $("#textBar");
  const predictBar = $("#predictBar");
  const kb = $("#keyboard");
  const rowBackOption = $("#rowBackOption");
  const settingsMenu = $("#settingsMenu");
  const launchParams = new URLSearchParams(window.location.search);
  const returnToPhraseboard = launchParams.get("returnTo") === "phraseboard";
  const phraseboardMode = launchParams.get("mode") || "";
  const phraseboardCategory = launchParams.get("category") || "";
  const phraseboardBoard = launchParams.get("board") || "";
  const phraseboardCategoryTitle = launchParams.get("title") || "";
  const phraseboardCategoryColor = launchParams.get("color") || "";
  const PHRASEBOARD_ADD_WORD_RETURN_KEY = "phraseboard_pending_add_word";
  const PHRASEBOARD_ADD_CATEGORY_TITLE_RETURN_KEY = "phraseboard_pending_add_category_title";
  const isAddWordMode = returnToPhraseboard && phraseboardMode === "add-word";
  const isAddCategoryTitleMode = returnToPhraseboard && phraseboardMode === "add-category-title";

  const defaultSettings = {
    autocapI: true,
    theme: "default",
    scanSpeed: "medium",
    highlightColor: "yellow",
    autoScan: false  // Changed from true to false
  };

  let settings = loadSettings();
  function loadSettings() {
    try { 
      const v = JSON.parse(localStorage.getItem("kb_settings")); 
      // Remove voiceIndex from keyboard settings as it's now handled by voice manager
      if (v && 'voiceIndex' in v) delete v.voiceIndex;
      return { ...defaultSettings, ...v }; 
    }
    catch { 
      return { ...defaultSettings }; 
    }
  }

  // INTEGRATION: Sync with Shared Scan Manager
  if (window.NarbeScanManager) {
      console.log("🔗 Connected to NarbeScanManager");
      
      // Update local logic when manager changes
      window.NarbeScanManager.subscribe((newSettings) => {
          console.log("🔄 Scan settings updated from Hub:", newSettings);
          
          // Restart auto-scan if active to apply new speed
          if (isAutoScanning) {
              stopAutoScan();
              startAutoScan();
          }
          updateScanSpeedDisplay();
      });
  }

  function saveSettings() {
    localStorage.setItem("kb_settings", JSON.stringify(settings));
  }

  // Scanning timers/state used by manager subscription callback.
  let autoScanInterval = null;
  let isAutoScanning = false;

  // TTS functionality using unified voice manager with interruption
  function speak(text) {
    // Always cancel any currently speaking TTS first
    if (window.NarbeVoiceManager && window.NarbeVoiceManager.cancel) {
      window.NarbeVoiceManager.cancel();
    }
    
    // Small delay to ensure cancellation takes effect
    setTimeout(() => {
      if (window.NarbeVoiceManager && window.NarbeVoiceManager.speakProcessed) {
        window.NarbeVoiceManager.speakProcessed(text);
      }
    }, 50);
  }

  // Scan timing configuration - derived from Manager when possible
  // We keep this structure for manual interaction timeouts (Long Press) which aren't in Manager yet
  // But we will try to scale them relative to the main speed if we can, or just keep fixed defaults for hold durations.
  const scanSpeeds = {
    slow: { forward: 1500, backward: 3000, longPress: 2000 },
    medium: { forward: 1000, backward: 2000, longPress: 2000 },
    fast: { forward: 500, backward: 1000, longPress: 2000 }
  };
  
  // Helper to get current interval from Manager
  function getScanInterval() {
      if (window.NarbeScanManager) {
          return window.NarbeScanManager.getSettings().scanInterval;
      }
      return 2000; // Fallback default
  }

  let currentScanSpeed = settings.scanSpeed || "medium";

  // Theme management
  const themes = ["default", "light", "dark", "blue", "green", "purple", "orange", "red"];
  let currentThemeIndex = themes.indexOf(settings.theme) || 0;

  // Highlight color management
  const highlightColors = ["yellow", "pink", "green", "orange", "black", "white", "purple", "red"];
  let currentHighlightIndex = highlightColors.indexOf(settings.highlightColor) || 0;

  function applyTheme(theme) {
    themes.forEach(t => document.body.classList.remove(`theme-${t}`));
    if (theme !== "default") {
      document.body.classList.add(`theme-${theme}`);
    }
    settings.theme = theme;
    saveSettings();
    updateThemeDisplay();
  }

  function applyHighlightColor(color) {
    highlightColors.forEach(c => document.body.classList.remove(`highlight-${c}`));
    document.body.classList.add(`highlight-${color}`);
    settings.highlightColor = color;
    saveSettings();
    updateHighlightDisplay();
  }

  // Settings menu state
  let inSettingsMode = false;
  let settingsRowIndex = 0;
  let settingsItems = [];

  // Scanning state
  let inRowSelectionMode = true;
  let inSectionRowSelectionMode = false;
  let currentSection = null; // "letters" | "numbers"
  let currentSectionRowIndex = -1;
  let currentRowIndex = 0;
  let currentButtonIndex = 0;
  let spacebarPressed = false;
  let returnPressed = false;
  let spacebarPressTime = null;
  let returnPressTime = null;
  let longPressTriggered = false;
  let backwardScanInterval = null;
  let backwardScanningOccurred = false; // Track if backward scanning actually happened
  let lastEnterReleaseAt = 0;

  const ROW_RESELECT_HOLD_MS = 1200;
  const ROW_RESELECT_DOUBLE_TAP_MS = 500;
  const MAX_PREDICTIONS = 6;
  const DEFAULT_PREDICTIONS = [
    "I", "YOU", "IT", "IS", "THE", "TO", "AND", "MY", "ME", "WE",
    "WANT", "NEED", "HELP", "PLEASE", "CAN", "GO", "LIKE", "NOT", "YES", "NO"
  ];

  // Text state
  let buffer = "";
  let ttsUseCount = 0;

  function setBuffer(txt) {
    buffer = txt;
    const displayText = buffer + "|";
    textBar.textContent = displayText;
    
    // Dynamically adjust text size based on length
    adjustTextSize(displayText);
    
    ttsUseCount = 0;
    renderPredictions();
  }

  function adjustTextSize(text) {
    // Remove all size classes first
    textBar.classList.remove('text-medium', 'text-small', 'text-tiny');
    
    // Get the text length without the cursor
    const textLength = text.replace('|', '').length;
    
    // Apply appropriate class based on text length
    if (textLength > 100) {
      textBar.classList.add('text-tiny');
    } else if (textLength > 50) {
      textBar.classList.add('text-small');
    } else if (textLength > 25) {
      textBar.classList.add('text-medium');
    }
    // Otherwise use default size (no class needed)
  }

  // Keyboard layout with symbols for control buttons
  // Left side: Letters in rows of 4 | Right side: Numbers in rows of 2
  const rows = [
    // Control row (6 columns wide)
    isAddWordMode
      ? ["Space", "Del Letter", "Del Word", "Clear", "Add Word", "Exit"]
      : isAddCategoryTitleMode
      ? ["Space", "Del Letter", "Del Word", "Clear", "Set Title", "Exit"]
      : ["Space", "Del Letter", "Del Word", "Clear", "Settings", "Exit"],
    // Letter rows: 4 letters on left (cols 0-3) | 2 numbers on right (cols 4-5)
    ["A","B","C","D","0","1"],
    ["E","F","G","H","2","3"],
    ["I","J","K","L","4","5"],
    ["M","N","O","P","6","7"],
    ["Q","R","S","T","8","9"],
    ["U","V","W","X","",""],
    ["Y","Z","","","",""]
  ];

  const TOP_LEVEL_ROWS = {
    TEXT: 0,
    CONTROLS: 1,
    LETTERS_SECTION: 2,
    NUMBERS_SECTION: 3,
    PREDICTIVE: 4
  };
  const TOP_LEVEL_ROW_COUNT = 5;
  const LETTER_ROW_MAP = [1, 2, 3, 4, 5, 6, 7]; // keyboard physical rows
  const NUMBER_ROW_MAP = [1, 2, 3, 4, 5]; // keyboard physical rows containing 0-9

  // Control button symbols
  const controlSymbols = {
    "Space": "—",        // Em dash symbol (changed from underscore)
    "Del Letter": "⌫",   // Backspace symbol
    "Del Word": "⌦",     // Delete forward symbol
    "Clear": "✕",        // Clear/X symbol
    "Settings": "⚙",     // Gear symbol
    "Add Word": "＋",    // Confirm/save symbol
    "Set Title": "＋",   // Confirm/save symbol
    "Exit": "⏻"          // Power/Exit symbol
  };

  function renderKeyboard() {
    kb.innerHTML = "";
    kb.classList.toggle("add-word-mode", isAddWordMode || isAddCategoryTitleMode);
    rows.forEach((row, rIdx) => {
      row.forEach((key) => {
        const btn = document.createElement("button");
        btn.className = "key" + (rIdx === 0 ? " ctrl" : "");
        
        if (key === "Space" || key === "Del Letter" || key === "Del Word" || key === "Clear") {
          btn.classList.add("white-key");
        } else if (key === "Settings") {
          btn.classList.add("settings");
        } else if (key === "Add Word" || key === "Set Title") {
          btn.classList.add("confirm");
        } else if (key === "Exit") {
          btn.classList.add("exit");
        }
        
        // For control buttons, add symbol and text
        if (rIdx === 0 && controlSymbols[key]) {
          btn.innerHTML = `
            <span class="ctrl-symbol">${controlSymbols[key]}</span>
            <span class="ctrl-text">${key}</span>
          `;
        } else {
          btn.textContent = key;
        }
        
        btn.addEventListener("click", () => {
          if (rIdx === 0) {
            handleControl(key);
          } else {
            insertKey(key);
          }
        });
        kb.appendChild(btn);
      });
    });
    highlightTextBox();
  }

  function highlightTopLevelRow() {
    clearAllHighlights();
    hideRowBackOption();
    if (currentRowIndex === TOP_LEVEL_ROWS.TEXT) {
      highlightTextBox();
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) {
      highlightPhysicalRow(0, 0, 5);
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION) {
      highlightSectionGroup("letters");
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION) {
      highlightSectionGroup("numbers");
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
      highlightPredictiveRow();
    }
  }

  function speakTopLevelRowTitle() {
    if (currentRowIndex === TOP_LEVEL_ROWS.TEXT) {
      speak("text box");
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) {
      speak("controls");
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION) {
      speak("letters section");
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION) {
      speak("numbers section");
      return;
    }
    if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
      speakPredictions();
    }
  }

  function getSectionRowMap(section = currentSection) {
    return section === "numbers" ? NUMBER_ROW_MAP : LETTER_ROW_MAP;
  }

  function getSectionRowKeys(section = currentSection, sectionRowIndex = currentSectionRowIndex) {
    if (sectionRowIndex < 0) return [];
    const rowMap = getSectionRowMap(section);
    const physicalRow = rowMap[sectionRowIndex];
    const row = rows[physicalRow] || [];
    if (section === "numbers") return row.slice(4, 6).filter(k => (k || "").trim());
    return row.slice(0, 4).filter(k => (k || "").trim());
  }

  function getSectionRowCount(section = currentSection) {
    const rowMap = getSectionRowMap(section);
    return rowMap.length;
  }

  function getCurrentButtonKeys() {
    if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) return rows[0].filter(k => (k || "").trim());
    if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
      return Array.from(predictBar.querySelectorAll(".chip")).map(ch => (ch.textContent || "").trim()).filter(Boolean);
    }
    if (inSectionRowSelectionMode && (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION || currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION)) {
      return getSectionRowKeys();
    }
    return [];
  }

  function getButtonDomIndex(buttonIndex) {
    if (buttonIndex < 0) return null;
    if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) return buttonIndex;
    if (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION || currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION) {
      if (currentSectionRowIndex < 0) return null;
      const rowMap = getSectionRowMap();
      const physicalRow = rowMap[currentSectionRowIndex];
      const base = physicalRow * 6;
      if (currentSection === "numbers") return base + 4 + buttonIndex;
      return base + buttonIndex;
    }
    return null;
  }

  function highlightPhysicalRow(physicalRowIndex, startCol, endCol) {
    const allKeys = kb.querySelectorAll(".key");
    const rowStart = physicalRowIndex * 6;
    for (let col = startCol; col <= endCol; col++) {
      const key = allKeys[rowStart + col];
      if (key) key.classList.add("highlighted");
    }
  }

  function highlightSectionGroup(section) {
    const rowMap = getSectionRowMap(section);
    rowMap.forEach(physicalRow => {
      if (section === "numbers") highlightPhysicalRow(physicalRow, 4, 5);
      else highlightPhysicalRow(physicalRow, 0, 3);
    });
  }

  function highlightSectionRow(section = currentSection, sectionRowIndex = currentSectionRowIndex) {
    clearAllHighlights();
    showRowBackOption();
    if (sectionRowIndex < 0) {
      highlightRowBackOption();
      return;
    }
    const rowMap = getSectionRowMap(section);
    const physicalRow = rowMap[sectionRowIndex];
    if (section === "numbers") highlightPhysicalRow(physicalRow, 4, 5);
    else highlightPhysicalRow(physicalRow, 0, 3);
  }

  function speakSectionRowTitle(section = currentSection, sectionRowIndex = currentSectionRowIndex) {
    if (sectionRowIndex < 0) {
      speak("back to section selection");
      return;
    }
    const keys = getSectionRowKeys(section, sectionRowIndex);
    if (!keys.length) {
      speak("empty row");
      return;
    }
    const label = keys.join(" ").toLowerCase();
    speak(section === "numbers" ? `numbers ${label}` : label);
  }

  document.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      startScanning();
    } else if (e.code === "Enter") {
      e.preventDefault();
      startSelecting();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      stopScanning();
    } else if (e.code === "Enter") {
      e.preventDefault();
      stopSelecting();
    }
  });

  function startScanning() {
    if (!spacebarPressed) {
      spacebarPressed = true;
      spacebarPressTime = Date.now();
      backwardScanningOccurred = false; // Reset backward scanning flag
      console.log("Spacebar pressed");
      
      const speed = scanSpeeds[currentScanSpeed];
      
      setTimeout(() => {
        if (spacebarPressed && (Date.now() - spacebarPressTime) >= speed.longPress) {
          console.log("Long press detected - starting backward scanning");
          backwardScanInterval = setInterval(() => {
            if (spacebarPressed) {
              backwardScanningOccurred = true; // Mark that backward scanning is happening
              if (inSettingsMode) {
                scanSettingsBackward();
              } else {
                scanBackward();
              }
            }
          }, speed.backward);
        }
      }, speed.longPress);
    }
  }

  function stopScanning() {
    if (spacebarPressed) {
      spacebarPressed = false;
      const pressDuration = Date.now() - spacebarPressTime;
      console.log(`Spacebar released after ${pressDuration}ms, backward scanning occurred: ${backwardScanningOccurred}`);
      
      if (backwardScanInterval) {
        clearInterval(backwardScanInterval);
        backwardScanInterval = null;
      }
      
      const speed = scanSpeeds[currentScanSpeed];
      
      // Forward scan if:
      // 1. Short press (250ms to longPress threshold), OR
      // 2. Long press but no backward scanning actually occurred
      if ((pressDuration >= 250 && pressDuration <= speed.longPress) || 
          (pressDuration > speed.longPress && !backwardScanningOccurred)) {
        console.log("Triggering forward scan - either short press or long press without backward scanning");
        if (inSettingsMode) {
          scanSettingsForward();
        } else {
          scanForward();
        }
      } else if (backwardScanningOccurred) {
        console.log("Long press with backward scanning - no forward scan on release");
      }
      
      spacebarPressTime = null;
      backwardScanningOccurred = false; // Reset for next press
    }
  }

  function startSelecting() {
    if (!returnPressed) {
      returnPressed = true;
      returnPressTime = Date.now();
      longPressTriggered = false;
      console.log("Return pressed");
      
      setTimeout(() => {
        if (returnPressed && (Date.now() - returnPressTime) >= ROW_RESELECT_HOLD_MS) {
          handleLongPress();
        }
      }, ROW_RESELECT_HOLD_MS);
    }
  }

  function stopSelecting() {
    if (returnPressed) {
      returnPressed = false;
      const pressDuration = Date.now() - returnPressTime;
      console.log(`Return released after ${pressDuration}ms`);
      
      if (!longPressTriggered && pressDuration >= 100) {
        console.log("Short press - selecting");
        selectButton();
      }

      if (inRowSelectionMode === false && !longPressTriggered) {
        const now = Date.now();
        if ((now - lastEnterReleaseAt) <= ROW_RESELECT_DOUBLE_TAP_MS) {
          inRowSelectionMode = true;
          inSectionRowSelectionMode = false;
          currentSection = null;
          clearAllHighlights();
          highlightTopLevelRow();
          speakTopLevelRowTitle();
          speak("row selection");
        }
        lastEnterReleaseAt = now;
      } else {
        lastEnterReleaseAt = Date.now();
      }
      
      returnPressTime = null;
      longPressTriggered = false;
    }
  }

  function handleLongPress() {
    longPressTriggered = true;
    clearAllHighlights();
    
    if (inRowSelectionMode) {
      if (inSectionRowSelectionMode) {
        inSectionRowSelectionMode = false;
        currentSection = null;
        clearAllHighlights();
        highlightTopLevelRow();
        speakTopLevelRowTitle();
        speak("section selection");
      } else {
        // Jump to predictive row from top-level row selection.
        currentRowIndex = TOP_LEVEL_ROWS.PREDICTIVE;
        inRowSelectionMode = true;
        inSectionRowSelectionMode = false;
        currentSection = null;
        highlightPredictiveRow();
        console.log("Long press: Jumped to predictive text row");
        speakPredictions();
      }
    } else {
      // Exit button mode to the current row-selection level.
      inRowSelectionMode = true;
      if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
        highlightPredictiveRow();
        speakPredictions();
      } else if (inSectionRowSelectionMode) {
        highlightSectionRow();
        speakSectionRowTitle();
      } else {
        highlightTopLevelRow();
        speakTopLevelRowTitle();
      }
      console.log("Long press: Returned to row selection mode");
    }
  }

  function scanForward() {
    if (inRowSelectionMode) {
      if (inSectionRowSelectionMode) {
        const optionCount = getSectionRowCount() + 1; // include Back option as -1
        const normalized = currentSectionRowIndex + 1;
        const next = (normalized + 1) % optionCount;
        currentSectionRowIndex = next - 1;
        highlightSectionRow();
        speakSectionRowTitle();
      } else {
        currentRowIndex = (currentRowIndex + 1) % TOP_LEVEL_ROW_COUNT;
        console.log(`Scanning forward to top-level row ${currentRowIndex}`);
        highlightTopLevelRow();
        speakTopLevelRowTitle();
      }
    } else {
      const prevButton = currentButtonIndex;
      if (currentRowIndex === TOP_LEVEL_ROWS.TEXT) {
        return; // Can't navigate buttons in textbar
      } else if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
        // Predictive row navigation
        const chips = predictBar.querySelectorAll(".chip");
        const optionCount = chips.length + 1;
        const normalized = currentButtonIndex + 1;
        const next = (normalized + 1) % optionCount;
        currentButtonIndex = next - 1;
        if (currentButtonIndex < 0) {
          highlightRowBackOption();
          speak("back to row selection");
        } else {
          highlightPredictiveButton(currentButtonIndex, prevButton);
          speakPredictiveButtonLabel(currentButtonIndex);
        }
      } else {
        // Controls/section row navigation
        const optionCount = getCurrentButtonKeys().length + 1;
        const normalized = currentButtonIndex + 1;
        const next = (normalized + 1) % optionCount;
        currentButtonIndex = next - 1;
        highlightButton(currentButtonIndex, prevButton);
        speakButtonLabel(currentButtonIndex);
      }
    }
  }

  function scanBackward() {
    if (inRowSelectionMode) {
      if (inSectionRowSelectionMode) {
        const optionCount = getSectionRowCount() + 1; // include Back option as -1
        const normalized = currentSectionRowIndex + 1;
        const prev = (normalized - 1 + optionCount) % optionCount;
        currentSectionRowIndex = prev - 1;
        highlightSectionRow();
        speakSectionRowTitle();
      } else {
        currentRowIndex = (currentRowIndex - 1 + TOP_LEVEL_ROW_COUNT) % TOP_LEVEL_ROW_COUNT;
        console.log(`Scanning backward to top-level row ${currentRowIndex}`);
        highlightTopLevelRow();
        speakTopLevelRowTitle();
      }
    } else {
      const prevButton = currentButtonIndex;
      if (currentRowIndex === TOP_LEVEL_ROWS.TEXT) {
        return;
      } else if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
        // Predictive row navigation
        const chips = predictBar.querySelectorAll(".chip");
        const optionCount = chips.length + 1;
        const normalized = currentButtonIndex + 1;
        const prev = (normalized - 1 + optionCount) % optionCount;
        currentButtonIndex = prev - 1;
        if (currentButtonIndex < 0) {
          highlightRowBackOption();
          speak("back to row selection");
        } else {
          highlightPredictiveButton(currentButtonIndex, prevButton);
          speakPredictiveButtonLabel(currentButtonIndex);
        }
      } else {
        // Controls/section row navigation
        const optionCount = getCurrentButtonKeys().length + 1;
        const normalized = currentButtonIndex + 1;
        const prev = (normalized - 1 + optionCount) % optionCount;
        currentButtonIndex = prev - 1;
        highlightButton(currentButtonIndex, prevButton);
        speakButtonLabel(currentButtonIndex);
      }
    }
  }

  async function updatePredictiveButtons() {
    await renderPredictions();
  }

  function selectButton() {
    if (inSettingsMode) {
      selectSettingsItem();
      return;
    }
    
    if (inRowSelectionMode) {
      if (inSectionRowSelectionMode && (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION || currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION)) {
        if (currentSectionRowIndex < 0) {
          inSectionRowSelectionMode = false;
          currentSection = null;
          hideRowBackOption();
          clearAllHighlights();
          highlightTopLevelRow();
          speakTopLevelRowTitle();
          return;
        }
        inRowSelectionMode = false;
        currentButtonIndex = -1;
        clearAllHighlights();
        showRowBackOption();
        highlightRowBackOption();
        speak("back to row selection");
        return;
      }

      if (currentRowIndex === TOP_LEVEL_ROWS.TEXT) {
        // Textbar selection
        const text = buffer.replace(/\|/g, "").trim();
        if (text) {
          speak(text);
          ttsUseCount++;
          console.log(`TTS use count: ${ttsUseCount} for text: "${text}"`);
          
          if (ttsUseCount >= 3) {
            console.log("3x TTS usage detected - recording words");
            saveTextToPredictive(text);
            ttsUseCount = 0;
          }
        }
      } else if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
        // Predictive row selection - enter button mode
        inRowSelectionMode = false;
        currentButtonIndex = -1;
        clearAllHighlights();
        showRowBackOption();
        highlightRowBackOption();
        speak("back to row selection");
      } else if (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION || currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION) {
        // Section selected: now scan rows inside that section.
        inSectionRowSelectionMode = true;
        currentSection = currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION ? "letters" : "numbers";
        currentSectionRowIndex = -1;
        clearAllHighlights();
        highlightSectionRow();
        speakSectionRowTitle();
      } else {
        // Controls row selection.
        if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) {
          inRowSelectionMode = false;
          currentButtonIndex = -1;
          clearAllHighlights();
          showRowBackOption();
          highlightRowBackOption();
          speak("back to row selection");
        }
      }
    } else {
      if (currentRowIndex === TOP_LEVEL_ROWS.TEXT) {
        return;
      } else if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
        if (currentButtonIndex < 0) {
          inRowSelectionMode = true;
          hideRowBackOption();
          clearAllHighlights();
          highlightPredictiveRow();
          speakPredictions();
          return;
        }
        // Predictive button selection
        const chips = predictBar.querySelectorAll(".chip");
        if (chips[currentButtonIndex] && chips[currentButtonIndex].textContent.trim()) {
          const word = chips[currentButtonIndex].textContent.trim();
          const currentPartialWord = currentWord();
          let newBuffer = buffer;
          
          if (currentPartialWord && !buffer.endsWith(" ")) {
            newBuffer = buffer.slice(0, -currentPartialWord.length) + word + " ";
          } else {
            if (!buffer.endsWith(" ") && buffer.length) newBuffer += " ";
            newBuffer += word + " ";
          }
          
          setBuffer(newBuffer);
          
          // Record the selected word and context
          if (window.predictionSystem) {
            try {
              window.predictionSystem.recordLocalWord(word);
              const context = buffer.replace("|", "").trim();
              if (context) {
                window.predictionSystem.recordNgram(context, word);
              }
            } catch (e) {
              console.error('Error recording prediction:', e);
            }
          }
        }
        
        // Return to row selection mode for Predictive Row
        inRowSelectionMode = true;
        clearAllHighlights();
        
        // Wait for predictions to update then highlight and speak
        updatePredictiveButtons().then(() => {
            highlightPredictiveRow();
            speakPredictions();
        });
        return;

      } else {
        if (currentButtonIndex < 0) {
          inRowSelectionMode = true;
          hideRowBackOption();
          clearAllHighlights();
          if (inSectionRowSelectionMode && currentSection) {
            highlightSectionRow();
            speakSectionRowTitle();
          } else {
            highlightTopLevelRow();
            speakTopLevelRowTitle();
          }
          return;
        }
        // Keyboard button selection
        let stayInButtonMode = false;
        const rowKeys = getCurrentButtonKeys();
        const key = rowKeys[currentButtonIndex];
        if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) {
          handleControl(key);
          // Keep scanning this same controls row after non-navigation controls.
          if (!["Settings", "Exit", "Add Word", "Set Title"].includes(key)) {
            stayInButtonMode = true;
          }
        } else {
          insertKey(key);
          updatePredictiveButtons();
          // Keep scanning this same key row after typing.
          stayInButtonMode = true;
        }

        if (stayInButtonMode) {
          inRowSelectionMode = false;
          clearAllHighlights();
          showRowBackOption();
          highlightButton(currentButtonIndex);
          speakButtonLabel(currentButtonIndex);
          return;
        }
      }
      
      // Return to row selection mode for Keyboard Rows
      inRowSelectionMode = true;
      hideRowBackOption();
      clearAllHighlights();
      if (inSectionRowSelectionMode && currentSection) {
        highlightSectionRow();
        speakSectionRowTitle();
      } else {
        highlightTopLevelRow();
        speakTopLevelRowTitle();
      }
    }
  }

  async function renderPredictions() {
    try {
      const wasPredictiveRowHighlighted = (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE && inRowSelectionMode);
      const wasInButtonMode = (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE && !inRowSelectionMode);
      const savedButtonIndex = currentButtonIndex;
      
      let predictions = ["YES", "NO", "HELP", "THE", "I", "YOU"]; // Default fallback
      
      if (window.predictionSystem && window.predictionSystem.getHybridPredictions) {
        try {
          predictions = await window.predictionSystem.getHybridPredictions(buffer);
        } catch (e) {
          console.error('Error getting predictions:', e);
        }
      }

      if (!Array.isArray(predictions)) predictions = [];
      const mergedPredictions = [];
      [...predictions, ...DEFAULT_PREDICTIONS].forEach(word => {
        const clean = (word || '').toString().trim();
        if (!clean) return;
        if (!mergedPredictions.some(existing => existing.toLowerCase() === clean.toLowerCase())) {
          mergedPredictions.push(clean);
        }
      });
      predictions = mergedPredictions;
      
      console.log("Final predictions to render:", predictions);

      predictBar.innerHTML = "";
      predictions.slice(0, MAX_PREDICTIONS).forEach(w => {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.textContent = w;
        chip.addEventListener("click", () => {
          const partial = currentWord();
          let newBuf = buffer;
          if (partial && !buffer.endsWith(" ")) {
            newBuf = buffer.slice(0, -partial.length) + w + " ";
          } else {
            if (!buffer.endsWith(" ") && buffer.length) newBuf += " ";
            newBuf += w + " ";
          }
          setBuffer(newBuf);
          
          // Record if prediction system available
          if (window.predictionSystem) {
            try {
              window.predictionSystem.recordLocalWord(w);
              const context = buffer.replace("|", "").trim();
              if (context) {
                window.predictionSystem.recordNgram(context, w);
              }
            } catch (e) {
              console.error('Error recording prediction:', e);
            }
          }
        });
        predictBar.appendChild(chip);
      });

      while (predictBar.children.length < MAX_PREDICTIONS) {
        const chip = document.createElement("button");
        chip.className = "chip";
        chip.textContent = "";
        chip.disabled = true;
        predictBar.appendChild(chip);
      }
      
      if (wasPredictiveRowHighlighted) {
        highlightPredictiveRow();
      } else if (wasInButtonMode) {
        const chips = predictBar.querySelectorAll(".chip");
        if (chips[savedButtonIndex]) {
          highlightPredictiveButton(savedButtonIndex);
        }
      }
    } catch (error) {
      console.error('Error in renderPredictions:', error);
    }
  }

  function currentWord() {
    const trimmed = buffer.replace(/\|/g, "").trimEnd();
    const parts = trimmed.split(/\s+/);
    if (buffer.endsWith(" ")) return "";
    return parts[parts.length - 1] || "";
  }

  function clearAllHighlights() {
    textBar.classList.remove("highlighted");
    if (rowBackOption) rowBackOption.classList.remove("highlighted");
    const allKeys = kb.querySelectorAll(".key");
    allKeys.forEach(key => key.classList.remove("highlighted"));
    const allChips = predictBar.querySelectorAll(".chip");
    allChips.forEach(chip => chip.classList.remove("highlighted"));
  }

  function alignRowBackOptionToCurrentRow() {
    if (!rowBackOption) return;

    let targetRect = null;

    if (currentRowIndex === TOP_LEVEL_ROWS.CONTROLS) {
      const allKeys = kb.querySelectorAll(".key");
      const rowStart = 0;
      const rowFirstKey = allKeys[rowStart];
      if (rowFirstKey) targetRect = rowFirstKey.getBoundingClientRect();
    } else if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
      const firstChip = predictBar.querySelector(".chip");
      if (firstChip) targetRect = firstChip.getBoundingClientRect();
    } else if (currentRowIndex === TOP_LEVEL_ROWS.LETTERS_SECTION || currentRowIndex === TOP_LEVEL_ROWS.NUMBERS_SECTION) {
      if (inSectionRowSelectionMode && currentSectionRowIndex < 0) {
        const sectionAnchor = kb.querySelector(".key");
        if (sectionAnchor) targetRect = sectionAnchor.getBoundingClientRect();
      }
      const allKeys = kb.querySelectorAll(".key");
      const rowMap = getSectionRowMap();
      if (!targetRect) {
        const physicalRow = rowMap[currentSectionRowIndex] ?? rowMap[0];
        const rowStart = physicalRow * 6;
        const colOffset = currentSection === "numbers" ? 4 : 0;
        const rowFirstKey = allKeys[rowStart + colOffset];
        if (rowFirstKey) targetRect = rowFirstKey.getBoundingClientRect();
      }
    }

    if (!targetRect) {
      rowBackOption.style.top = "50%";
      rowBackOption.style.transform = "translateY(-50%)";
      return;
    }

    const optionHeight = rowBackOption.offsetHeight || 72;
    const rowCenterY = targetRect.top + (targetRect.height / 2);
    const top = Math.max(8, Math.round(rowCenterY - (optionHeight / 2)));
    rowBackOption.style.top = `${top}px`;
    rowBackOption.style.transform = "none";
  }

  function showRowBackOption() {
    if (!rowBackOption) return;
    rowBackOption.classList.remove("hidden");
    alignRowBackOptionToCurrentRow();
  }

  function hideRowBackOption() {
    if (!rowBackOption) return;
    rowBackOption.classList.add("hidden");
    rowBackOption.classList.remove("highlighted");
    rowBackOption.style.top = "50%";
    rowBackOption.style.transform = "translateY(-50%)";
  }

  function highlightRowBackOption() {
    if (!rowBackOption) return;
    clearAllHighlights();
    showRowBackOption();
    rowBackOption.classList.add("highlighted");
  }

  function highlightTextBox() {
    clearAllHighlights();
    textBar.classList.add("highlighted");
  }

  function highlightRow(rowIndex) {
    clearAllHighlights();
    highlightPhysicalRow(rowIndex, 0, 5);
  }

  function highlightButton(buttonIndex, prevButtonIndex = null) {
    if (buttonIndex < 0) {
      highlightRowBackOption();
      return;
    }
    const allKeys = kb.querySelectorAll(".key");
    const currentDomIndex = getButtonDomIndex(buttonIndex);
    const prevDomIndex = prevButtonIndex !== null ? getButtonDomIndex(prevButtonIndex) : null;
    
    if (prevDomIndex !== null && allKeys[prevDomIndex]) {
      allKeys[prevDomIndex].classList.remove("highlighted");
    }
    
    if (currentDomIndex !== null && allKeys[currentDomIndex]) {
      allKeys[currentDomIndex].classList.add("highlighted");
    }
  }

  function highlightPredictiveRow() {
    clearAllHighlights();
    const allChips = predictBar.querySelectorAll(".chip");
    allChips.forEach(chip => chip.classList.add("highlighted"));
  }

  function highlightPredictiveButton(buttonIndex, prevButtonIndex = null) {
    if (buttonIndex < 0) {
      highlightRowBackOption();
      return;
    }
    const chips = predictBar.querySelectorAll(".chip");
    
    if (prevButtonIndex !== null && chips[prevButtonIndex]) {
      chips[prevButtonIndex].classList.remove("highlighted");
    }
    
    if (chips[buttonIndex]) {
      chips[buttonIndex].classList.add("highlighted");
    }
  }

  function speakRowTitle(rowIndex) {
    const rowTitles = ["controls", "letters section", "numbers section", "predictive text"];
    if (rowIndex === 3) {
      speakPredictions();
      return;
    }
    if (rowIndex >= 0 && rowIndex < rowTitles.length) {
      speak(rowTitles[rowIndex]);
    }
  }

  function speakButtonLabel(buttonIndex) {
    if (buttonIndex < 0) {
      speak("back to row selection");
      return;
    }
    const keys = getCurrentButtonKeys();
    const label = keys[buttonIndex];
    if (!label || !label.trim()) {
      return;
    }
    let spokenLabel = label.toLowerCase();
    
    if (spokenLabel === "del letter") spokenLabel = "delete letter";
    if (spokenLabel === "del word") spokenLabel = "delete word";
    
    // For single letters and short words, let the voice manager handle pronunciation
    // Remove the special case handling here since voice manager now handles it
    speak(spokenLabel);
  }

  function speakPredictiveButtonLabel(buttonIndex) {
    if (buttonIndex < 0) {
      speak("back to row selection");
      return;
    }
    const chips = predictBar.querySelectorAll(".chip");
    if (chips[buttonIndex] && chips[buttonIndex].textContent.trim()) {
      const word = chips[buttonIndex].textContent.trim();
      console.log(`Speaking predictive button: "${word}"`);
      speak(word); // Voice manager will handle proper pronunciation processing
    }
  }

  function speakPredictions() {
    const predictButtons = document.querySelectorAll('#predictBar .chip');
    if (predictButtons.length > 0) {
      const predictions = Array.from(predictButtons)
        .map(btn => btn.textContent)
        .filter(text => text.trim());
      
      if (predictions.length > 0) {
        // Process each prediction individually through the voice manager BEFORE joining
        console.log(`Speaking predictions: ${predictions}`);
        
        // Process each word through the voice manager's pronunciation mapping
        const processedPredictions = predictions.map(word => {
          let processed = word;
          // Fix for short uppercase words (like "IT", "IS") being read as letters
          if (processed && processed.length > 1 && processed.length <= 4 && processed === processed.toUpperCase()) {
            processed = processed.toLowerCase();
          }

          if (window.NarbeVoiceManager && window.NarbeVoiceManager.processTextForSpeech) {
            return window.NarbeVoiceManager.processTextForSpeech(processed);
          }
          return processed;
        });
        
        const announcement = processedPredictions.join(", ");
        console.log(`Processed predictions announcement: "${announcement}"`);
        
        // Use the voice manager's speak function directly to avoid double-processing
        if (window.NarbeVoiceManager && window.NarbeVoiceManager.speak) {
          window.NarbeVoiceManager.speak(announcement);
        } else {
          speak(announcement);
        }
      } else {
        speak("no predictions available");
      }
    } else {
      speak("no predictions available");
    }
  }

  function openSettings() {
    inSettingsMode = true;
    settingsMenu.classList.remove("hidden");
    kb.style.display = "none";
    predictBar.style.display = "none";
    textBar.style.display = "none"; // Hide text bar too
    hideRowBackOption();
    
    settingsItems = Array.from(settingsMenu.querySelectorAll(".settings-item"));
    settingsRowIndex = 0;
    highlightSettingsItem(0);
    
    updateThemeDisplay();
    updateScanSpeedDisplay();
    updateVoiceDisplay();
    updateHighlightDisplay();
    updateTTSToggleDisplay(); // Add TTS toggle display update
    updateAutoScanDisplay(); // Add Auto Scan display update
  }
  
  // Initialize settings click handlers ONCE using event delegation
  function initSettingsClickHandlers() {
    const settingsGrid = document.getElementById('settingsGrid');
    if (!settingsGrid) return;
    
    settingsGrid.addEventListener('click', (e) => {
      const item = e.target.closest('.settings-item');
      if (!item) return;
      
      const allItems = Array.from(settingsMenu.querySelectorAll(".settings-item"));
      const index = allItems.indexOf(item);
      if (index !== -1) {
        settingsRowIndex = index;
        highlightSettingsItem(settingsRowIndex);
        selectSettingsItem();
      }
    });
    
    settingsGrid.addEventListener('mouseenter', (e) => {
      const item = e.target.closest('.settings-item');
      if (!item) return;
      
      const allItems = Array.from(settingsMenu.querySelectorAll(".settings-item"));
      const index = allItems.indexOf(item);
      if (index !== -1) {
        settingsRowIndex = index;
        highlightSettingsItem(settingsRowIndex);
        
        const label = item.querySelector(".setting-label");
        if (label) speak(label.textContent.toLowerCase());
      }
    }, true); // Use capture to catch mouseenter on child elements
  }

  function closeSettings() {
    inSettingsMode = false;
    settingsMenu.classList.add("hidden");
    kb.style.display = "grid";
    predictBar.style.display = "grid";
    textBar.style.display = "flex"; // Show text bar again
    
    // No need to clone/replace elements - we use event delegation now
    
    inRowSelectionMode = true;
    currentRowIndex = 0;
    hideRowBackOption();
    highlightTextBox();
  }

  function highlightSettingsItem(index) {
    settingsItems.forEach(item => item.classList.remove("highlighted"));
    if (settingsItems[index]) {
      settingsItems[index].classList.add("highlighted");
    }
  }

  function scanSettingsForward() {
    settingsRowIndex = (settingsRowIndex + 1) % settingsItems.length;
    highlightSettingsItem(settingsRowIndex);
    
    const item = settingsItems[settingsRowIndex];
    const label = item.querySelector(".setting-label").textContent;
    speak(label.toLowerCase());
  }

  function scanSettingsBackward() {
    settingsRowIndex = (settingsRowIndex - 1 + settingsItems.length) % settingsItems.length;
    highlightSettingsItem(settingsRowIndex);
    
    const item = settingsItems[settingsRowIndex];
    const label = item.querySelector(".setting-label").textContent;
    speak(label.toLowerCase());
  }

  function selectSettingsItem() {
    const item = settingsItems[settingsRowIndex];
    const setting = item.dataset.setting;
    
    switch (setting) {
      case "theme":
        cycleTheme();
        break;
        
      case "scan-speed":
        cycleScanSpeed();
        break;
        
      case "voice":
        cycleVoice();
        break;
        
      case "highlight":
        cycleHighlightColor();
        break;
        
      case "tts-toggle":
        toggleTTS();
        break;
        
      case "auto-scan":
        toggleAutoScan();
        break;
        
      case "volume-up":
        adjustVolume("up");
        break;
        
      case "volume-down":
        adjustVolume("down");
        break;
        
      case "close":
        closeSettings();
        speak("settings closed");
        break;
    }
  }

  async function adjustVolume(direction) {
    try {
      
      const response = await fetch('/system/volume/' + direction, {
        method: 'POST'
      });
      
      if (response.ok) {
        // const result = await response.json();
        console.log('Volume adjusted:', direction);
        speak(direction === "up" ? "volume up" : "volume down");
      } else {
        console.error('Failed to control volume');
        speak("volume control failed");
      }
    } catch (error) {
      console.error('Error controlling volume:', error);
      speak("volume control error");
    }
  }

  function cycleTheme() {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    const newTheme = themes[currentThemeIndex];
    applyTheme(newTheme);
    speak(newTheme);
  }

  function updateThemeDisplay() {
    const themeValue = $("#themeValue");
    if (themeValue) {
      themeValue.textContent = themes[currentThemeIndex];
    }
  }

  function cycleScanSpeed() {
    if (window.NarbeScanManager) {
        window.NarbeScanManager.cycleScanSpeed();
        // Update is handled by subscription
        const speed = getScanInterval();
        speak(`scan speed ${speed/1000} seconds`);
    } else {
        // Fallback if manager missing
        const speeds = ["slow", "medium", "fast"];
        const currentIndex = speeds.indexOf(currentScanSpeed);
        const nextIndex = (currentIndex + 1) % speeds.length;
        currentScanSpeed = speeds[nextIndex];
        
        settings.scanSpeed = currentScanSpeed;
        saveSettings();
        updateScanSpeedDisplay();
        speak(currentScanSpeed);
        
        if (isAutoScanning) {
          stopAutoScan();
          startAutoScan();
        }
    }
  }

  function updateScanSpeedDisplay() {
    const speedValue = $("#scanSpeedValue");
    if (speedValue) {
      if (window.NarbeScanManager) {
          const names = ["Fast (1s)", "Medium (2s)", "Slow (3s)", "Extra Slow (4s)"];
          const idx = window.NarbeScanManager.getSettings().scanSpeedIndex;
          speedValue.textContent = names[idx] || "Medium (2s)";
      } else {
        speedValue.textContent = "Medium";
      }
    }
  }

  function cycleVoice() {
    // Check if voices are loaded using shared manager API
    if (window.NarbeVoiceManager && window.NarbeVoiceManager.areVoicesLoaded && !window.NarbeVoiceManager.areVoicesLoaded()) {
      if (window.NarbeVoiceManager.waitForVoices) {
          window.NarbeVoiceManager.waitForVoices().then(() => {
            updateVoiceDisplay();
          });
      }
      speak("initializing voices");
      return;
    }
    
    // Cycle voice using shared manager
    if (window.NarbeVoiceManager && window.NarbeVoiceManager.cycleVoice) {
        const voiceChanged = window.NarbeVoiceManager.cycleVoice();
        if (voiceChanged) {
            updateVoiceDisplay();
            const currentVoice = window.NarbeVoiceManager.getCurrentVoice();
            const displayName = window.NarbeVoiceManager.getVoiceDisplayName(currentVoice);
            speak(`voice changed to ${displayName}`);
        } else {
             speak("refreshing voice list");
        }
    }
  }

  function updateVoiceDisplay() {
    const voiceValue = $("#voiceValue");
    if (voiceValue && window.NarbeVoiceManager) {
      const currentVoice = window.NarbeVoiceManager.getCurrentVoice();
      const displayName = window.NarbeVoiceManager.getVoiceDisplayName(currentVoice);
      voiceValue.textContent = displayName;
    }
  }

  function cycleHighlightColor() {
    currentHighlightIndex = (currentHighlightIndex + 1) % highlightColors.length;
    const newColor = highlightColors[currentHighlightIndex];
    applyHighlightColor(newColor);
    speak(newColor);
  }

  function updateHighlightDisplay() {
    const highlightValue = $("#highlightValue");
    if (highlightValue) {
      const colorName = highlightColors[currentHighlightIndex];
      highlightValue.textContent = colorName.charAt(0).toUpperCase() + colorName.slice(1);
    }
  }

  function toggleTTS() {
    const ttsEnabled = window.NarbeVoiceManager.toggleTTS();
    updateTTSToggleDisplay();
    speak(ttsEnabled ? "TTS enabled" : "TTS disabled");
  }

  function updateTTSToggleDisplay() {
    const ttsValue = $("#ttsToggleValue");
    if (ttsValue) {
      const voiceSettings = window.NarbeVoiceManager.getSettings();
      ttsValue.textContent = voiceSettings.ttsEnabled ? "On" : "Off";
    }
  }

  function toggleAutoScan() {
    isAutoScanning = !isAutoScanning;
    settings.autoScan = isAutoScanning;
    saveSettings();
    updateAutoScanDisplay();
    speak(isAutoScanning ? "Auto Scan enabled" : "Auto Scan disabled");
    
    if (isAutoScanning) {
      startAutoScan();
    } else {
      stopAutoScan();
    }
  }

  function updateAutoScanDisplay() {
    const autoScanValue = $("#autoScanValue");
    if (autoScanValue) {
      autoScanValue.textContent = isAutoScanning ? "On" : "Off";
    }
  }

  function startAutoScan() {
    if (autoScanInterval) return;
    
    // Use unified speed from manager
    const speed = getScanInterval();
    
    autoScanInterval = setInterval(() => {
      if (inSettingsMode) {
        scanSettingsForward();
      } else {
        scanForward();
      }
    }, speed);
  }

  function stopAutoScan() {
    if (autoScanInterval) {
      clearInterval(autoScanInterval);
      autoScanInterval = null;
    }
  }

  function readInstructions() {
    const instructions = `
      Welcome to Ben's Keyboard. Here are the instructions for using this keyboard.
      
      Navigation controls:
      Spacebar short press will advance forward through rows and buttons.
      Spacebar long hold will move backward through rows and buttons until released.
      
      Selection controls:
      Return key short press will select the highlighted item.
      Return key long press in button mode will return you to row selection mode.
      You can also quickly double tap Return in button mode to return to row selection mode.
      Return key long hold in row selection mode will jump directly to predictive text.
      
      The keyboard has several rows:
      First is the text bar where your typed text appears. Click or select it to hear your text read aloud.
      Second is the predictive text row with word suggestions.
      Third is the controls row with space, delete, clear, settings, and exit.
      Then letter rows A through Z and number rows 0 through 9.
      
      Tips:
      Saying the same text three times will save those words to your predictions for faster typing later.
      You can change themes, scan speed, voice, and highlight colors in settings.
      The TTS toggle controls whether items are read aloud as you navigate.
      The Auto Scan toggle enables automatic scanning through rows and buttons.
      
      Press return to continue using the keyboard.
    `;
    
    if (window.NarbeVoiceManager) {
      window.NarbeVoiceManager.cancel();
      window.NarbeVoiceManager.speak(instructions, { rate: 0.9 });
    }
  }

  function handleControl(key) {
    if (key === "Space") return insertKey(" ");
    if (key === "Del Letter") { setBuffer(buffer.slice(0, -1)); return; }
    if (key === "Del Word")   { setBuffer(buffer.trimEnd().replace(/\S+\s*$/, "")); return; }
    if (key === "Clear")      { setBuffer(""); return; }
    if (key === "Settings")   { 
      openSettings();
      return; 
    }
    if (key === "Add Word")   {
      confirmAddWord();
      return;
    }
    if (key === "Set Title")   {
      confirmSetCategoryTitle();
      return;
    }
    if (key === "Exit")       { 
      console.log("Exit button pressed");
      exitKeyboard();
      return; 
    }
  }

  function saveAddWordToPhraseboard() {
      const text = buffer.replace(/\|/g, "").trim();
      if (!text) return false;
      sessionStorage.setItem(PHRASEBOARD_ADD_WORD_RETURN_KEY, JSON.stringify({
        word: text,
        category: phraseboardCategory,
        board: phraseboardBoard,
        ts: Date.now()
      }));
      return true;
  }

  function confirmAddWord() {
      if (!isAddWordMode) {
          exitKeyboard();
          return;
      }

      if (!saveAddWordToPhraseboard()) {
          speak("type a word first");
          return;
      }

      speak("adding word to category");
      returnToPhraseboardView();
  }

      function saveCategoryTitleToPhraseboard() {
        const text = buffer.replace(/\|/g, "").trim();
        if (!text) return false;
        sessionStorage.setItem(PHRASEBOARD_ADD_CATEGORY_TITLE_RETURN_KEY, JSON.stringify({
        title: text,
        color: phraseboardCategoryColor,
        board: phraseboardBoard,
        ts: Date.now()
        }));
        return true;
      }

      function confirmSetCategoryTitle() {
        if (!isAddCategoryTitleMode) {
          exitKeyboard();
          return;
        }

        if (!saveCategoryTitleToPhraseboard()) {
          speak("type a title first");
          return;
        }

        speak("category title set");
        returnToPhraseboardView();
      }

  function returnToPhraseboardView() {
      // Always navigate directly so phraseboard can restore the exact saved context
      // (board/category/page) from session storage.
      if (isAddCategoryTitleMode) {
        const title = (buffer || "").replace(/\|/g, "").trim();
        const params = new URLSearchParams();
        if (title) params.set("addCategoryTitle", title);
        if (phraseboardCategoryColor) params.set("addCategoryColor", phraseboardCategoryColor);
        const query = params.toString();
        window.location.href = query
        ? `../phraseboard/index.html?${query}`
        : "../phraseboard/index.html";
        return;
      }
      window.location.href = "../phraseboard/index.html";
  }

  function exitKeyboard() {
      if (returnToPhraseboard) {
        if (isAddCategoryTitleMode) {
          const hasTypedTitle = (buffer || '').replace(/\|/g, '').trim().length > 0;
          if (hasTypedTitle) {
            saveCategoryTitleToPhraseboard();
          }
        }
          speak("returning to phrase board");
          returnToPhraseboardView();
          return;
      }

      closeChrome();
  }

  async function closeChrome() {
      speak("exiting");
      // Since we are running in an iframe within Benny's Hub, we should communicate with the parent
      // to close this app (which just hides the iframe).
      try {
          window.parent.postMessage({ action: 'closeApp' }, '*');
      } catch (e) {
          console.error("Failed to post message to parent:", e);
          speak("error exiting");
      }
  }

  function insertKey(k) {
    if (settings.autocapI && k.length === 1) {
      const prev = buffer.slice(-1);
      if ((k === "i" || k === "I") && (!prev || /\s/.test(prev))) k = "I";
    }
    
    if (k === " ") {
      const currentText = buffer.replace('|', '').trim();
      const words = currentText.split(' ');
      if (words.length > 0) {
        const lastWord = words[words.length - 1];
        if (lastWord && lastWord.length > 0 && window.predictionSystem) {
          try {
            window.predictionSystem.recordLocalWord(lastWord);
            console.log(`Auto-learned word: ${lastWord}`);
            
            if (words.length > 1) {
              const context = words.slice(0, -1).join(' ');
              window.predictionSystem.recordNgram(context, lastWord);
            }
          } catch (e) {
            console.error('Error recording word:', e);
          }
        }
      }
    }
    
    setBuffer(buffer + k);
  }

  function saveTextToPredictive(text) {
    console.log(`Text repeated 3 times via TTS: "${text}"`);
    const words = text.split(/\s+/).filter(word => word.trim().length > 0);
    
    // Record each word individually with higher priority
    words.forEach((word, index) => {
      if (word && word.trim().length > 0 && window.predictionSystem) {
        try {
          const cleanWord = word.trim().toUpperCase();
          
          // Record the word multiple times to give it higher priority
          for (let i = 0; i < 5; i++) {
            window.predictionSystem.recordLocalWord(cleanWord);
          }
          console.log(`Recorded word "${cleanWord}" 5 times for high priority`);
          
          // Record n-grams for context
          if (index > 0) {
            const context = words.slice(0, index).join(' ');
            for (let i = 0; i < 3; i++) {
              window.predictionSystem.recordNgram(context, cleanWord);
            }
            console.log(`Recorded n-gram: "${context}" -> "${cleanWord}" 3 times`);
          }
        } catch (e) {
          console.error('Error recording word:', e);
        }
      }
    });
    
    // Force immediate re-merge and re-render
    setTimeout(() => {
      if (window.predictionSystem) {
        window.predictionSystem.mergeData();
      }
      renderPredictions();
      console.log('Forced prediction system update after TTS recording');
    }, 200);
  }

  textBar.addEventListener("click", () => {
    const text = buffer.replace(/\|/g, "").trim();
    if (text) {
      window.NarbeVoiceManager.speakProcessed(text);
      
      ttsUseCount++;
      console.log(`TTS use count: ${ttsUseCount} for text: "${text}"`);
      
      if (ttsUseCount >= 3) {
        console.log("3x TTS usage detected - recording words with high priority");
        saveTextToPredictive(text);
        ttsUseCount = 0;
        
        // Clear the buffer after saving to predictions to start fresh
        setTimeout(() => {
          setBuffer("");
          console.log('Buffer cleared after 3x TTS - ready for fresh input');
        }, 1000);
      }
    }
  });

  const originalSetBuffer = setBuffer;
  setBuffer = function(newBuffer) {
    const wasPredictiveRowHighlighted = (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE && inRowSelectionMode);
    
    originalSetBuffer(newBuffer);
    updatePredictiveButtons().then(() => {
      if (wasPredictiveRowHighlighted) {
        setTimeout(() => {
          highlightPredictiveRow();
        }, 50);
      }
    });
  };

  function init() {
    console.log('Initializing keyboard...');
    
    // Wait for voice manager to load voices, then update display
    if (window.NarbeVoiceManager && window.NarbeVoiceManager.waitForVoices) {
      window.NarbeVoiceManager.waitForVoices().then(() => {
        console.log('Voice manager initialized with', window.NarbeVoiceManager.voices.length, 'voices');
        updateVoiceDisplay();
        updateTTSToggleDisplay();
      }).catch(e => {
        console.log('Voice manager error:', e);
        updateVoiceDisplay();
        updateTTSToggleDisplay();
      });
    } else {
      // Fallback if voice manager not available
      setTimeout(() => {
        updateVoiceDisplay();
        updateTTSToggleDisplay();
      }, 100);
    }
    
    // Listen for voice settings changes from other apps or voice manager
    if (window.NarbeVoiceManager && window.NarbeVoiceManager.onSettingsChange) {
      window.NarbeVoiceManager.onSettingsChange(() => {
        updateVoiceDisplay();
        updateTTSToggleDisplay();
      });
    }
    
    
    // Periodic voice validation handled by Shared Manager events
    // (setInterval removed as it used deprecated local methods)

    
    applyTheme(settings.theme);
    applyHighlightColor(settings.highlightColor || "yellow");
    currentScanSpeed = settings.scanSpeed || "medium";
    
    console.log('Rendering keyboard...');
    renderKeyboard();
    
    console.log('Setting initial buffer...');
    if (isAddCategoryTitleMode && phraseboardCategoryTitle) {
      setBuffer(phraseboardCategoryTitle);
    } else {
      setBuffer("");
    }
    
    // Wait for prediction system to initialize
    const initPredictions = () => {
      if (window.predictionSystem && window.predictionSystem.dataLoaded) {
        console.log('Prediction system ready, rendering predictions');
        renderPredictions();
      } else {
        console.log('Waiting for prediction system...');
        setTimeout(initPredictions, 100);
      }
    };
    
    setTimeout(initPredictions, 100);
    
    // Initialize settings click handlers (event delegation)
    initSettingsClickHandlers();

    if (rowBackOption) {
      rowBackOption.addEventListener("click", () => {
        inRowSelectionMode = true;
        hideRowBackOption();
        clearAllHighlights();
        if (currentRowIndex === TOP_LEVEL_ROWS.PREDICTIVE) {
          highlightPredictiveRow();
          speakPredictions();
        } else if (inSectionRowSelectionMode && currentSection) {
          highlightSectionRow();
          speakSectionRowTitle();
        } else {
          highlightTopLevelRow();
          speakTopLevelRowTitle();
        }
      });
    }

    window.addEventListener("resize", () => {
      if (rowBackOption && !rowBackOption.classList.contains("hidden")) {
        alignRowBackOptionToCurrentRow();
      }
    });
    
    if (settings.autoScan) {
      isAutoScanning = true;
      startAutoScan();
    }
    
    console.log('Keyboard initialization complete');
  }

  init();
})();
