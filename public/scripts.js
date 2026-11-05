(() => {
  'use strict';
  const board = document.querySelector('.memory-game');
  const cards = [...board.querySelectorAll('.memory-card')];
  const movesOutput = document.querySelector('#moves');
  const timeOutput = document.querySelector('#time');
  const pairsOutput = document.querySelector('#pairs');
  const bestOutput = document.querySelector('#best');
  const status = document.querySelector('#status');
  const storageKey = 'memory-game.best.v1';
  let firstCard = null;
  let locked = false;
  let moves = 0;
  let pairs = 0;
  let startedAt = null;
  let clock = null;
  let pendingFlip = null;
  let best = readBest();

  function readBest() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey));
      return value && Number.isSafeInteger(value.moves) && value.moves >= cards.length / 2
        && Number.isSafeInteger(value.seconds) && value.seconds >= 0 ? value : null;
    } catch {
      return null;
    }
  }

  function formatTime(seconds) {
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function elapsedSeconds() {
    return startedAt === null ? 0 : Math.floor((performance.now() - startedAt) / 1000);
  }

  function updateClock() {
    timeOutput.textContent = formatTime(elapsedSeconds());
  }

  function showBest() {
    bestOutput.textContent = best ? `${best.moves} moves · ${formatTime(best.seconds)}` : 'No completed game yet';
  }

  function reveal(card) {
    card.classList.add('flip');
    card.setAttribute('aria-pressed', 'true');
    card.setAttribute('aria-label', `${card.dataset.framework}, revealed`);
  }

  function hide(card) {
    card.classList.remove('flip', 'matched');
    card.setAttribute('aria-pressed', 'false');
    card.removeAttribute('aria-disabled');
    card.setAttribute('aria-label', `Card ${card.dataset.position}, face down`);
  }

  function finish() {
    clearInterval(clock);
    clock = null;
    const seconds = elapsedSeconds();
    updateClock();
    const improved = !best || moves < best.moves || (moves === best.moves && seconds < best.seconds);
    if (improved) {
      best = { moves, seconds };
      try {
        localStorage.setItem(storageKey, JSON.stringify(best));
      } catch {
        // The game remains playable when browser storage is unavailable.
      }
      showBest();
    }
    status.textContent = `All six pairs found in ${moves} moves and ${formatTime(seconds)}.${improved ? ' New personal best!' : ''} Play again for a fresh board.`;
  }

  function flipCard(card) {
    if (locked || card === firstCard || card.classList.contains('matched')) return;
    if (startedAt === null) {
      startedAt = performance.now();
      clock = setInterval(updateClock, 250);
    }
    reveal(card);
    if (firstCard === null) {
      firstCard = card;
      status.textContent = 'Choose another card to find its pair.';
      return;
    }
    moves += 1;
    movesOutput.textContent = String(moves);
    const previousCard = firstCard;
    firstCard = null;
    if (previousCard.dataset.framework === card.dataset.framework) {
      pairs += 1;
      pairsOutput.textContent = `${pairs} / 6`;
      [previousCard, card].forEach((match) => {
        match.classList.add('matched');
        match.setAttribute('aria-disabled', 'true');
        match.setAttribute('aria-label', `${match.dataset.framework}, matched`);
      });
      status.textContent = `Pair found! ${6 - pairs} pairs remaining.`;
      if (pairs === 6) finish();
      return;
    }
    locked = true;
    status.textContent = 'No match. Remember these cards and try again.';
    pendingFlip = setTimeout(() => {
      hide(previousCard);
      hide(card);
      locked = false;
      pendingFlip = null;
      status.textContent = 'Choose a card to continue.';
    }, 1000);
  }

  function restart() {
    clearTimeout(pendingFlip);
    clearInterval(clock);
    pendingFlip = null;
    clock = null;
    firstCard = null;
    locked = false;
    moves = 0;
    pairs = 0;
    startedAt = null;
    // Fisher–Yates gives every card a unique position in the shuffled deck.
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((card, index) => {
      board.append(card);
      card.dataset.position = index + 1;
      hide(card);
    });
    movesOutput.textContent = '0';
    pairsOutput.textContent = '0 / 6';
    timeOutput.textContent = '0:00';
    status.textContent = 'Find all six pairs. The timer starts with your first card.';
    showBest();
  }

  cards.forEach((card) => card.addEventListener('click', () => flipCard(card)));
  document.querySelector('#restart').addEventListener('click', restart);
  restart();
})();
