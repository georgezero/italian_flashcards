(function () {
  const STORAGE_KEY = "flashcards-study-state-v2";
  const STORAGE_VERSION = 2;
  const CARD_DATA = Array.isArray(window.CARD_DATA) ? window.CARD_DATA : [];
  const cards = CARD_DATA.map((card, index) => ({
    ...card,
    id: createCardId(card.italian, index)
  }));
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  const elements = {
    modeButtons: Array.from(document.querySelectorAll(".mode-button")),
    shuffleButton: document.getElementById("shuffle-button"),
    restartButton: document.getElementById("restart-button"),
    clearHardButton: document.getElementById("clear-hard-button"),
    networkStatus: document.getElementById("network-status"),
    offlineStatus: document.getElementById("offline-status"),
    sessionNote: document.getElementById("session-note"),
    progressFill: document.getElementById("progress-fill"),
    scoreValue: document.getElementById("score-value"),
    easyCount: document.getElementById("easy-count"),
    hardCount: document.getElementById("hard-count"),
    savedHardCount: document.getElementById("saved-hard-count"),
    cardFrame: document.getElementById("card-frame"),
    cardButton: document.getElementById("card-button"),
    italianWord: document.getElementById("italian-word"),
    frenchWord: document.getElementById("french-word"),
    englishWord: document.getElementById("english-word"),
    cardNote: document.getElementById("card-note"),
    easyButton: document.getElementById("easy-button"),
    hardButton: document.getElementById("hard-button"),
    liveRegion: document.getElementById("live-region"),
    emptyTemplate: document.getElementById("empty-state-template"),
    completionTemplate: document.getElementById("completion-template")
  };

  let state = loadState();

  bindEvents();
  updateConnectionStatus();
  render();
  registerServiceWorker();

  function bindEvents() {
    elements.modeButtons.forEach((button) => {
      button.addEventListener("click", function () {
        setMode(button.dataset.mode || "all");
      });
    });

    elements.shuffleButton.addEventListener("click", function () {
      resetSession({ mode: state.mode, shuffle: true, preserveSavedHard: true });
      announce("Deck shuffled.");
      render();
    });

    elements.restartButton.addEventListener("click", function () {
      resetSession({ mode: state.mode, shuffle: false, preserveSavedHard: true });
      announce("Session restarted.");
      render();
    });

    elements.clearHardButton.addEventListener("click", function () {
      state.savedHardCardIds = [];
      if (state.mode === "hard") {
        resetSession({ mode: "hard", shuffle: false, preserveSavedHard: true });
      } else {
        persistState();
      }
      announce("Difficult cards cleared.");
      render();
    });

    elements.cardButton.addEventListener("click", function () {
      flipCurrentCard();
    });

    elements.easyButton.addEventListener("click", function () {
      gradeCurrentCard("easy");
    });

    elements.hardButton.addEventListener("click", function () {
      gradeCurrentCard("hard");
    });

    document.addEventListener("click", function (event) {
      const emptyAction = event.target.closest("[data-empty-action]");
      if (emptyAction) {
        setMode("all");
        return;
      }

      const completionAction = event.target.closest("[data-completion-action]");
      if (!completionAction) {
        return;
      }

      const action = completionAction.getAttribute("data-completion-action");
      if (action === "review-hard") {
        setMode("hard");
      } else if (action === "restart") {
        resetSession({ mode: state.mode, shuffle: false, preserveSavedHard: true });
        render();
      }
    });

    document.addEventListener("keydown", handleShortcuts);
    window.addEventListener("online", updateConnectionStatus);
    window.addEventListener("offline", updateConnectionStatus);
  }

  function handleShortcuts(event) {
    const isTypingContext = event.target instanceof HTMLElement &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);
    if (isTypingContext) {
      return;
    }

    if (event.key === "1") {
      event.preventDefault();
      setMode("all");
      return;
    }

    if (event.key === "2") {
      event.preventDefault();
      setMode("false-friends");
      return;
    }

    if (event.key === "3") {
      event.preventDefault();
      setMode("hard");
      return;
    }

    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      resetSession({ mode: state.mode, shuffle: false, preserveSavedHard: true });
      announce("Session restarted.");
      render();
      return;
    }

    if (event.key.toLowerCase() === "s") {
      event.preventDefault();
      resetSession({ mode: state.mode, shuffle: true, preserveSavedHard: true });
      announce("Deck shuffled.");
      render();
      return;
    }

    if (isCompletionState() || isEmptyHardState()) {
      return;
    }

    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      if (!state.flipped) {
        flipCurrentCard();
      } else {
        goToNextCard();
      }
      return;
    }

    if (!state.flipped) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      gradeCurrentCard("hard");
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      gradeCurrentCard("easy");
    }
  }

  function setMode(mode) {
    if (!["all", "false-friends", "hard"].includes(mode)) {
      return;
    }

    resetSession({ mode, shuffle: false, preserveSavedHard: true });
    announce(modeLabel(mode) + " mode selected.");
    render();
  }

  function flipCurrentCard() {
    if (isCompletionState() || isEmptyHardState()) {
      return;
    }

    state.flipped = !state.flipped;
    persistState();
    renderCard();
    renderActions();

    if (state.flipped) {
      const card = getCurrentCard();
      if (card) {
        announce(`Answer revealed. French: ${card.french}. English: ${card.english}.`);
      }
    } else {
      announce("Card turned back over.");
    }
  }

  function gradeCurrentCard(result) {
    if (!state.flipped) {
      return;
    }

    const card = getCurrentCard();
    if (!card) {
      return;
    }

    const easyIds = new Set(state.easyCardIds);
    const hardIds = new Set(state.hardCardIds);
    const savedHardIds = new Set(state.savedHardCardIds);

    easyIds.delete(card.id);
    hardIds.delete(card.id);

    if (result === "easy") {
      easyIds.add(card.id);
      savedHardIds.delete(card.id);
      announce(`${card.italian} marked easy.`);
    } else {
      hardIds.add(card.id);
      savedHardIds.add(card.id);
      announce(`${card.italian} saved as difficult.`);
    }

    state.easyCardIds = Array.from(easyIds);
    state.hardCardIds = Array.from(hardIds);
    state.savedHardCardIds = Array.from(savedHardIds);

    goToNextCard();
  }

  function goToNextCard() {
    const total = getOrderedCards().length;
    state.currentIndex = Math.min(state.currentIndex + 1, total);
    state.flipped = false;
    persistState();
    render();
  }

  function resetSession(options) {
    const mode = options.mode || state.mode || "all";
    const preserveSavedHard = options.preserveSavedHard !== false;
    const savedHardCardIds = preserveSavedHard ? state.savedHardCardIds.slice() : [];
    const modeCards = getCardsForMode(mode, savedHardCardIds);
    const orderedIds = modeCards.map((card) => card.id);
    if (options.shuffle) {
      shuffleInPlace(orderedIds);
    }

    state = {
      version: STORAGE_VERSION,
      mode,
      order: orderedIds,
      currentIndex: 0,
      flipped: false,
      easyCardIds: [],
      hardCardIds: [],
      savedHardCardIds,
      lastUpdatedAt: new Date().toISOString()
    };

    persistState();
  }

  function render() {
    syncModeButtons();
    renderStats();

    if (isEmptyHardState()) {
      renderEmptyState();
      renderActions(true);
      return;
    }

    if (isCompletionState()) {
      renderCompletionState();
      renderActions(true);
      return;
    }

    renderCard();
    renderActions(false);
  }

  function renderStats() {
    const total = getOrderedCards().length;
    const complete = isCompletionState();
    const easyCount = state.easyCardIds.length;
    const hardCount = state.hardCardIds.length;
    const answeredCount = easyCount + hardCount;
    const score = answeredCount > 0 ? Math.round((easyCount / answeredCount) * 100) : 0;
    const progress = total === 0 ? 0 : complete ? 100 : Math.round((state.currentIndex / total) * 100);
    const counter = total === 0 ? "Card 0 of 0" : `Card ${Math.min(state.currentIndex + 1, total)} of ${total}`;

    elements.sessionNote.textContent = counter;
    elements.progressFill.style.width = progress + "%";
    elements.scoreValue.textContent = score + "%";
    elements.easyCount.textContent = String(easyCount);
    elements.hardCount.textContent = String(hardCount);
    elements.savedHardCount.textContent = String(state.savedHardCardIds.length);
  }

  function renderCard() {
    const card = getCurrentCard();
    if (!card) {
      return;
    }

    restoreCardFrame();

    elements.cardButton.hidden = false;
    elements.cardButton.classList.toggle("is-flipped", state.flipped);
    elements.cardButton.setAttribute("aria-pressed", state.flipped ? "true" : "false");
    elements.cardButton.setAttribute("aria-label", state.flipped ? "Hide answer" : "Reveal answer");
    elements.italianWord.textContent = card.italian;
    elements.frenchWord.textContent = card.french;
    elements.englishWord.textContent = card.english;

    if (card.notes) {
      elements.cardNote.hidden = false;
      elements.cardNote.textContent = card.notes;
    } else {
      elements.cardNote.hidden = true;
      elements.cardNote.textContent = "";
    }
  }

  function renderActions(disabled) {
    const shouldDisable = Boolean(disabled) || !state.flipped;
    elements.easyButton.disabled = shouldDisable;
    elements.hardButton.disabled = shouldDisable;
  }

  function renderEmptyState() {
    const fragment = elements.emptyTemplate.content.cloneNode(true);
    elements.cardFrame.replaceChildren(fragment);
  }

  function renderCompletionState() {
    const fragment = elements.completionTemplate.content.cloneNode(true);
    const title = fragment.querySelector("#completion-title");
    const copy = fragment.querySelector("#completion-copy");
    const stats = fragment.querySelector("#completion-stats");

    title.textContent = `You finished ${modeLabel(state.mode).toLowerCase()}.`;
    copy.textContent = state.savedHardCardIds.length > 0
      ? "Your difficult cards are saved locally for offline review."
      : "No difficult cards are saved right now. Start another round when you are ready.";

    stats.append(
      makeCompletionChip(`Easy ${state.easyCardIds.length}`),
      makeCompletionChip(`Hard ${state.hardCardIds.length}`),
      makeCompletionChip(`Saved ${state.savedHardCardIds.length}`),
      makeCompletionChip(`Score ${elements.scoreValue.textContent}`)
    );

    const reviewButton = fragment.querySelector('[data-completion-action="review-hard"]');
    reviewButton.disabled = state.savedHardCardIds.length === 0;

    elements.cardFrame.replaceChildren(fragment);
  }

  function restoreCardFrame() {
    if (elements.cardFrame.contains(elements.cardButton)) {
      return;
    }

    elements.cardFrame.replaceChildren(elements.cardButton);
  }

  function syncModeButtons() {
    elements.modeButtons.forEach((button) => {
      const selected = button.dataset.mode === state.mode;
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
  }

  function getCardsForMode(mode, savedHardCardIdsOverride) {
    const savedHardIds = new Set(savedHardCardIdsOverride || state.savedHardCardIds);
    if (mode === "false-friends") {
      return cards.filter((card) => card.category === "false-friends");
    }
    if (mode === "hard") {
      return cards.filter((card) => savedHardIds.has(card.id));
    }
    return cards.slice();
  }

  function getOrderedCards() {
    const modeCards = getCardsForMode(state.mode);
    const idsInMode = new Set(modeCards.map((card) => card.id));
    const orderedCards = [];
    const seen = new Set();

    state.order.forEach((id) => {
      if (!idsInMode.has(id) || seen.has(id)) {
        return;
      }
      seen.add(id);
      const card = cardsById.get(id);
      if (card) {
        orderedCards.push(card);
      }
    });

    modeCards.forEach((card) => {
      if (seen.has(card.id)) {
        return;
      }
      orderedCards.push(card);
    });

    return orderedCards;
  }

  function getCurrentCard() {
    return getOrderedCards()[state.currentIndex] || null;
  }

  function isCompletionState() {
    const total = getOrderedCards().length;
    return total > 0 && state.currentIndex >= total;
  }

  function isEmptyHardState() {
    return state.mode === "hard" && getOrderedCards().length === 0;
  }

  function makeCompletionChip(text) {
    const chip = document.createElement("span");
    chip.textContent = text;
    return chip;
  }

  function announce(message) {
    elements.liveRegion.textContent = message;
  }

  function updateConnectionStatus() {
    const online = navigator.onLine;
    elements.networkStatus.textContent = online ? "Online" : "Offline";
    elements.networkStatus.className = `status-chip ${online ? "is-online" : "is-offline"}`;
  }

  function updateOfflineReady(isReady) {
    elements.offlineStatus.textContent = isReady ? "Offline cache ready" : "Offline cache unavailable";
    elements.offlineStatus.className = `status-chip ${isReady ? "is-ready" : "is-offline"}`;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      updateOfflineReady(false);
      return;
    }

    if (location.protocol !== "http:" && location.protocol !== "https:") {
      updateOfflineReady(false);
      return;
    }

    navigator.serviceWorker.register("./service-worker.js")
      .then(function (registration) {
        updateOfflineReady(Boolean(registration.active || registration.installing || registration.waiting));

        navigator.serviceWorker.addEventListener("message", function (event) {
          if (event.data && event.data.type === "OFFLINE_READY") {
            updateOfflineReady(true);
          }
        });
      })
      .catch(function () {
        updateOfflineReady(false);
      });
  }

  function loadState() {
    const fallback = {
      version: STORAGE_VERSION,
      mode: "all",
      order: cards.map((card) => card.id),
      currentIndex: 0,
      flipped: false,
      easyCardIds: [],
      hardCardIds: [],
      savedHardCardIds: [],
      lastUpdatedAt: new Date().toISOString()
    };

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== STORAGE_VERSION) {
        return fallback;
      }

      const candidate = {
        ...fallback,
        ...parsed
      };

      const validCardIds = new Set(cards.map((card) => card.id));
      candidate.order = Array.isArray(candidate.order)
        ? candidate.order.filter((id) => validCardIds.has(id))
        : fallback.order;
      candidate.easyCardIds = Array.isArray(candidate.easyCardIds)
        ? candidate.easyCardIds.filter((id) => validCardIds.has(id))
        : [];
      candidate.hardCardIds = Array.isArray(candidate.hardCardIds)
        ? candidate.hardCardIds.filter((id) => validCardIds.has(id))
        : [];
      candidate.savedHardCardIds = Array.isArray(candidate.savedHardCardIds)
        ? candidate.savedHardCardIds.filter((id) => validCardIds.has(id))
        : [];

      if (!["all", "false-friends", "hard"].includes(candidate.mode)) {
        candidate.mode = "all";
      }

      if (candidate.order.length === 0) {
        candidate.order = getCardsForMode(candidate.mode, candidate.savedHardCardIds).map((card) => card.id);
      }

      const maxIndex = getCardsForMode(candidate.mode, candidate.savedHardCardIds).length;
      candidate.currentIndex = clampNumber(candidate.currentIndex, 0, maxIndex);
      candidate.flipped = Boolean(candidate.flipped);
      return candidate;
    } catch (_error) {
      return fallback;
    }
  }

  function persistState() {
    state.lastUpdatedAt = new Date().toISOString();
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      return;
    }
  }

  function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return min;
    }
    return Math.max(min, Math.min(max, number));
  }

  function createCardId(text, index) {
    return `${text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${index}`;
  }

  function shuffleInPlace(list) {
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const temp = list[index];
      list[index] = list[swapIndex];
      list[swapIndex] = temp;
    }
  }

  function modeLabel(mode) {
    if (mode === "false-friends") {
      return "False friends";
    }
    if (mode === "hard") {
      return "Difficult cards";
    }
    return "All cards";
  }
})();
