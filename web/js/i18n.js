const I18n = (() => {
  const STORAGE_KEY = "pmc.lang";
  const DEFAULT_LANG = "ru";
  let dictionaries = {};
  let currentLang = DEFAULT_LANG;

  async function loadDictionary(lang) {
    if (dictionaries[lang]) return dictionaries[lang];
    const response = await fetch(`i18n/${lang}.json`);
    const data = await response.json();
    dictionaries[lang] = data;
    return data;
  }

  function applyToDom() {
    const dict = dictionaries[currentLang] || {};
    document.documentElement.lang = currentLang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (dict[key] !== undefined) el.textContent = dict[key];
    });
    document.querySelectorAll("#lang-switch button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === currentLang);
    });
  }

  function t(key, vars) {
    const dict = dictionaries[currentLang] || {};
    let text = dict[key] !== undefined ? dict[key] : key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        text = text.replace(`{${k}}`, vars[k]);
      });
    }
    return text;
  }

  async function setLang(lang) {
    await loadDictionary(lang);
    currentLang = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
    applyToDom();
    document.dispatchEvent(new CustomEvent("i18n:changed", { detail: { lang } }));
  }

  async function init() {
    let saved = DEFAULT_LANG;
    try {
      saved = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
    } catch (e) {}
    await setLang(saved);
  }

  return { init, setLang, t, get currentLang() { return currentLang; } };
})();
