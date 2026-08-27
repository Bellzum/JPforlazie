const SESSION_SECONDS = 10 * 60;

const state = {
  questions: [],
  currentIndex: 0,
  answers: [],
  selectedAnswer: null,
  timerId: null,
  secondsLeft: SESSION_SECONDS,
  vocabCategory: "laboratory-experiments"
};

const appData = {
  requirements: {},
  categories: [],
  lifeScienceVocabulary: []
};

const levelSelect = document.querySelector("#levelSelect");
const modeSelect = document.querySelector("#modeSelect");
const startBtn = document.querySelector("#startBtn");
const vocabBtn = document.querySelector("#vocabBtn");
const todayTitle = document.querySelector("#todayTitle");
const todayDescription = document.querySelector("#todayDescription");
const timerText = document.querySelector("#timerText");
const todayPanel = document.querySelector(".today-panel");
const coveragePanel = document.querySelector(".coverage-panel");
const quizPanel = document.querySelector("#quizPanel");
const resultPanel = document.querySelector("#resultPanel");
const vocabPanel = document.querySelector("#vocabPanel");
const questionCounter = document.querySelector("#questionCounter");
const categoryBadge = document.querySelector("#categoryBadge");
const questionText = document.querySelector("#questionText");
const answerList = document.querySelector("#answerList");
const nextBtn = document.querySelector("#nextBtn");
const finishBtn = document.querySelector("#finishBtn");
const restartBtn = document.querySelector("#restartBtn");
const scoreText = document.querySelector("#scoreText");
const categorySummary = document.querySelector("#categorySummary");
const reviewList = document.querySelector("#reviewList");
const streakCount = document.querySelector("#streakCount");
const coverageTitle = document.querySelector("#coverageTitle");
const coverageFocus = document.querySelector("#coverageFocus");
const vocabCoverage = document.querySelector("#vocabCoverage");
const vocabTargetText = document.querySelector("#vocabTargetText");
const grammarCoverage = document.querySelector("#grammarCoverage");
const grammarTargetText = document.querySelector("#grammarTargetText");
const sourceCoverage = document.querySelector("#sourceCoverage");
const backToCoachBtn = document.querySelector("#backToCoachBtn");
const vocabCategorySelect = document.querySelector("#vocabCategorySelect");
const vocabVisibleCount = document.querySelector("#vocabVisibleCount");
const vocabCategoryCount = document.querySelector("#vocabCategoryCount");
const vocabLevelRange = document.querySelector("#vocabLevelRange");
const vocabTableBody = document.querySelector("#vocabTableBody");

startBtn.disabled = true;

async function loadContent() {
  const [contentResponse, vocabResponse] = await Promise.all([
    fetch("data/content.json", { cache: "no-store" }),
    fetch("data/life-science-vocabulary.json", { cache: "no-store" })
  ]);

  if (!contentResponse.ok) {
    throw new Error(`Could not load data/content.json: ${contentResponse.status}`);
  }
  if (!vocabResponse.ok) {
    throw new Error(`Could not load data/life-science-vocabulary.json: ${vocabResponse.status}`);
  }

  const content = await contentResponse.json();
  const lifeScienceVocabulary = await vocabResponse.json();
  appData.requirements = content.requirements;
  appData.categories = content.categories;
  appData.lifeScienceVocabulary = lifeScienceVocabulary.categories;
}

function showContentError(error) {
  todayTitle.textContent = "Could not load quiz data";
  todayDescription.textContent =
    "Start a local web server from this folder, then open the app through http://localhost. JSON loading usually does not work from a direct file:// browser tab.";
  coverageTitle.textContent = "CSV/JSON data not loaded";
  coverageFocus.textContent = error.message;
  startBtn.disabled = true;
}

function loadProgress() {
  const progress = JSON.parse(localStorage.getItem("jlptCoachProgress") || "{}");
  streakCount.textContent = progress.streak || 0;
}

function saveSessionProgress(score) {
  const today = new Date().toISOString().slice(0, 10);
  const progress = JSON.parse(localStorage.getItem("jlptCoachProgress") || "{}");
  const lastDate = progress.lastDate;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const streak = lastDate === today ? progress.streak || 1 : lastDate === yesterday ? (progress.streak || 0) + 1 : 1;

  localStorage.setItem(
    "jlptCoachProgress",
    JSON.stringify({
      streak,
      lastDate: today,
      lastScore: score,
      weakItems: state.answers.filter((answer) => !answer.isCorrect).map((answer) => answer.item.target)
    })
  );
  streakCount.textContent = streak;
}

function getCategoriesForLevel(level) {
  return appData.categories.filter((group) => group.level === level);
}

function getCoverageStats(level) {
  const categories = getCategoriesForLevel(level);
  const items = categories.flatMap((group) => group.items);

  return {
    vocabCount: items.filter((item) => item.type === "vocab").length,
    grammarCount: items.filter((item) => item.type === "grammar").length,
    categoryCount: categories.length
  };
}

function renderCoverage(level) {
  const requirements = appData.requirements[level];
  const stats = getCoverageStats(level);

  if (!requirements) return;

  coverageTitle.textContent = `${level} ${requirements.label}`;
  coverageFocus.textContent = requirements.focus;
  vocabCoverage.textContent = `${stats.vocabCount} / ${requirements.vocabTarget.toLocaleString()}`;
  vocabTargetText.textContent = requirements.vocabRange;
  grammarCoverage.textContent = `${stats.grammarCount} / ${requirements.grammarTarget}`;
  grammarTargetText.textContent = requirements.grammarRange;
  sourceCoverage.textContent = requirements.sourceTypes.join(", ");
}

function pickTodayCategory(level, mode) {
  const categories = getCategoriesForLevel(level);
  if (!categories.length) return null;

  if (mode === "weak") {
    const progress = JSON.parse(localStorage.getItem("jlptCoachProgress") || "{}");
    const weakSet = new Set(progress.weakItems || []);
    const weakCategory = categories.find((group) => group.items.some((item) => weakSet.has(item.target)));
    if (weakCategory) return weakCategory;
  }
  const dayIndex = Math.floor(Date.now() / 86400000);
  return categories[dayIndex % categories.length];
}

function pickNextCategory(level, mode) {
  const categories = getCategoriesForLevel(level);
  const currentCategory = state.questions[0]?.category;

  if (mode === "weak") {
    const progress = JSON.parse(localStorage.getItem("jlptCoachProgress") || "{}");
    const weakSet = new Set(progress.weakItems || []);
    const weakCategories = categories.filter((group) => group.items.some((item) => weakSet.has(item.target)));
    if (weakCategories.length > 1) {
      return pickDifferentCategory(weakCategories, currentCategory);
    }
  }

  return pickDifferentCategory(categories, currentCategory);
}

function pickDifferentCategory(categories, currentCategory) {
  if (!categories.length) return null;
  if (categories.length <= 1) return categories[0];

  const availableCategories = categories.filter((group) => group.category !== currentCategory);
  return shuffle(availableCategories)[0];
}

function buildQuestions(category, mode) {
  const base = category.items.map((item) => prepareQuestion(item, category));

  if (mode === "exam") {
    return shuffle(base).slice(0, 6);
  }

  return shuffle(base).slice(0, 5);
}

function prepareQuestion(item, category) {
  const correctOption = item.options[item.answer];
  const options = shuffle(item.options);

  return {
    ...item,
    options,
    answer: options.indexOf(correctOption),
    category: category.category,
    level: category.level
  };
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function startSession(forceNewCategory = false) {
  showCoachView();
  const level = levelSelect.value;
  const mode = modeSelect.value;
  const category = forceNewCategory ? pickNextCategory(level, mode) : pickTodayCategory(level, mode);
  if (!category) return;

  state.questions = buildQuestions(category, mode);
  state.currentIndex = 0;
  state.answers = [];
  state.selectedAnswer = null;
  state.secondsLeft = SESSION_SECONDS;

  todayTitle.textContent = `${category.level}: ${category.category}`;
  todayDescription.textContent = category.description;
  quizPanel.classList.remove("hidden");
  resultPanel.classList.add("hidden");
  startTimer();
  renderQuestion();
}

function renderVocabularyCategoryOptions() {
  vocabCategorySelect.replaceChildren();

  appData.lifeScienceVocabulary.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    vocabCategorySelect.appendChild(option);
  });

  if (!appData.lifeScienceVocabulary.some((category) => category.id === state.vocabCategory)) {
    state.vocabCategory = appData.lifeScienceVocabulary[0]?.id || "";
  }
  vocabCategorySelect.value = state.vocabCategory;
  vocabCategoryCount.textContent = appData.lifeScienceVocabulary.length;
}

function getSelectedVocabularyCategory() {
  return appData.lifeScienceVocabulary.find((category) => category.id === state.vocabCategory);
}

function renderVocabularyTable() {
  const category = getSelectedVocabularyCategory();
  const items = category?.items || [];
  vocabTableBody.replaceChildren();
  vocabVisibleCount.textContent = items.length;
  vocabLevelRange.textContent = category?.subtitle || "PDF";

  if (!items.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td class="empty-state" colspan="4">No rows found for this PDF section.</td>';
    vocabTableBody.appendChild(row);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td data-label="Core concept"><strong class="jp-term">${item.coreConcept}</strong></td>
      <td data-label="Daily / Functional Japanese">${item.dailyFunctional}</td>
      <td data-label="Formal / Professional Japanese">${item.formalProfessional}</td>
      <td data-label="Specialist workplace term">${item.specialistWorkplace}</td>
    `;
    vocabTableBody.appendChild(row);
  });
}

function showVocabularyView() {
  clearInterval(state.timerId);
  quizPanel.classList.add("hidden");
  resultPanel.classList.add("hidden");
  todayPanel.classList.add("hidden");
  coveragePanel.classList.add("hidden");
  vocabPanel.classList.remove("hidden");
  renderVocabularyCategoryOptions();
  renderVocabularyTable();
  location.hash = "vocabulary";
}

function showCoachView() {
  vocabPanel.classList.add("hidden");
  todayPanel.classList.remove("hidden");
  coveragePanel.classList.remove("hidden");
  if (location.hash === "#vocabulary") {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

function startTimer() {
  clearInterval(state.timerId);
  updateTimer();
  state.timerId = setInterval(() => {
    state.secondsLeft -= 1;
    updateTimer();
    if (state.secondsLeft <= 0) finishSession();
  }, 1000);
}

function updateTimer() {
  const minutes = Math.floor(Math.max(state.secondsLeft, 0) / 60);
  const seconds = Math.max(state.secondsLeft, 0) % 60;
  timerText.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function renderQuestion() {
  const item = state.questions[state.currentIndex];
  state.selectedAnswer = null;
  nextBtn.disabled = true;

  questionCounter.textContent = `Question ${state.currentIndex + 1} of ${state.questions.length}`;
  categoryBadge.textContent = `${item.level} · ${item.category}`;
  questionText.textContent = item.question;
  answerList.replaceChildren();

  item.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.className = "answer-btn";
    button.type = "button";
    button.textContent = option;
    button.addEventListener("click", () => selectAnswer(index, button));
    answerList.appendChild(button);
  });
}

function selectAnswer(index, button) {
  state.selectedAnswer = index;
  document.querySelectorAll(".answer-btn").forEach((answerButton) => {
    answerButton.classList.remove("selected");
  });
  button.classList.add("selected");
  nextBtn.disabled = false;
}

function submitCurrentAnswer() {
  const item = state.questions[state.currentIndex];
  if (state.selectedAnswer === null) return;

  state.answers.push({
    item,
    selectedAnswer: state.selectedAnswer,
    isCorrect: state.selectedAnswer === item.answer
  });

  if (state.currentIndex === state.questions.length - 1) {
    finishSession();
    return;
  }

  state.currentIndex += 1;
  renderQuestion();
}

function finishSession() {
  clearInterval(state.timerId);
  quizPanel.classList.add("hidden");
  resultPanel.classList.remove("hidden");

  const answeredCount = state.answers.length;
  const correctCount = state.answers.filter((answer) => answer.isCorrect).length;
  const score = answeredCount ? Math.round((correctCount / answeredCount) * 100) : 0;
  scoreText.textContent = `${correctCount}/${answeredCount} correct · ${score}%`;
  saveSessionProgress(score);
  renderReview();
}

function renderReview() {
  const categories = [...new Set(state.answers.map((answer) => answer.item.category))];
  categorySummary.replaceChildren();
  reviewList.replaceChildren();

  categories.forEach((category) => {
    const pill = document.createElement("span");
    pill.textContent = category;
    categorySummary.appendChild(pill);
  });

  state.answers.forEach((answer) => {
    const { item } = answer;
    const card = document.createElement("article");
    card.className = answer.isCorrect ? "review-card correct" : "review-card incorrect";
    card.innerHTML = `
      <div class="review-status">${answer.isCorrect ? "Correct" : "Review again"}</div>
      <h3>${item.target}${item.reading ? `（${item.reading}）` : ""}</h3>
      <p><strong>Meaning:</strong> ${item.meaning}</p>
      <p><strong>Your answer:</strong> ${item.options[answer.selectedAnswer]}</p>
      <p><strong>Correct answer:</strong> ${item.options[item.answer]}</p>
      <p class="jp-example">${item.example}</p>
      <p>${item.exampleMeaning}</p>
    `;
    reviewList.appendChild(card);
  });

  if (!state.answers.length) {
    reviewList.innerHTML = '<p class="empty-state">No answered questions yet. Start a short session when ready.</p>';
  }
}

startBtn.addEventListener("click", () => startSession(false));
vocabBtn.addEventListener("click", showVocabularyView);
backToCoachBtn.addEventListener("click", showCoachView);
vocabCategorySelect.addEventListener("change", () => {
  state.vocabCategory = vocabCategorySelect.value;
  renderVocabularyTable();
});
nextBtn.addEventListener("click", submitCurrentAnswer);
finishBtn.addEventListener("click", finishSession);
restartBtn.addEventListener("click", () => startSession(true));
levelSelect.addEventListener("change", () => {
  const category = pickTodayCategory(levelSelect.value, modeSelect.value);
  if (!category) return;
  todayTitle.textContent = `${category.level}: ${category.category}`;
  todayDescription.textContent = category.description;
  renderCoverage(levelSelect.value);
});

async function initializeApp() {
  try {
    await loadContent();
    loadProgress();
    const initialCategory = pickTodayCategory(levelSelect.value, modeSelect.value);
    todayTitle.textContent = `${initialCategory.level}: ${initialCategory.category}`;
    todayDescription.textContent = initialCategory.description;
    renderCoverage(levelSelect.value);
    startBtn.disabled = false;
    renderVocabularyCategoryOptions();
    if (location.hash === "#vocabulary") showVocabularyView();
  } catch (error) {
    showContentError(error);
  }
}

initializeApp();
