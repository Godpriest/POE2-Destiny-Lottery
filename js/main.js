/**
 * POE2 Destiny Lottery — 基礎互動邏輯
 * （i18n、畫面切換、背景音樂、角色過濾池）
 */

(function () {
  'use strict';

  /* ── 靜態資產 CDN（Backblaze B2 + Cloudflare Pages 代理）── */

  const ASSET_BASE_URL = 'https://poe2-b2-proxy.pages.dev';

  function assetUrl(path) {
    const normalized = path.replace(/^\/+/, '');
    const encodedPath = normalized
      .split('/')
      .filter(Boolean)
      .map((segment) => encodeURIComponent(segment))
      .join('/')
      .replace(/%2F/gi, '/');
    return `${ASSET_BASE_URL}/${encodedPath}`;
  }

  const BGM_MAIN_SRC = assetUrl('bgm/The Veil of Forgotten Dreams.mp3');
  const BGM_END_SRC = assetUrl('bgm/Iron Gate Impact.mp3');
  const DRUM_SRC = assetUrl('bgm/drum.wav');
  const PORTRAIT_BG_VIDEO_SRC = assetUrl('webm/light_2.webm');
  const BACKGROUND_VIDEO_SRC = assetUrl('webm/background.webm');
  const REVEAL_TRANSITION_VIDEO_SRC = assetUrl('webm/light_1.webm');

  function setElementSource(mediaEl, src, type) {
    if (!mediaEl) return;

    let sourceEl = mediaEl.querySelector('source');
    if (!sourceEl) {
      sourceEl = document.createElement('source');
      mediaEl.appendChild(sourceEl);
    }

    sourceEl.src = src;
    if (type) sourceEl.type = type;
    if (mediaEl.tagName === 'VIDEO') {
      mediaEl.preload = 'auto';
    }
    mediaEl.load();
  }

  function normalizeVideoSource(videoEl, src) {
    setElementSource(videoEl, src, 'video/webm');
  }

  function initStaticMediaSources() {
    setElementSource(document.getElementById('bgm'), BGM_MAIN_SRC, 'audio/mpeg');
    setElementSource(document.getElementById('end-bgm'), BGM_END_SRC, 'audio/mpeg');
    normalizeVideoSource(document.querySelector('.bg-video'), BACKGROUND_VIDEO_SRC);
    normalizeVideoSource(document.getElementById('reveal-transition-video'), REVEAL_TRANSITION_VIDEO_SRC);
    normalizeVideoSource(document.getElementById('portrait-bg-video'), PORTRAIT_BG_VIDEO_SRC);
  }

  initStaticMediaSources();

  /* ── 語系字典 ───────────────────────────────────────────── */

  const translations = {
    'zh-TW': {
      pageTitle: 'POE2 Destiny Lottery',
      mainTitle: 'POE2 Destiny Lottery',
      subtitle: '命運之輪，靜候汝名',
      exileLabel: '流亡者 ID',
      exilePlaceholder: '輸入你的流亡者 ID…',
      drawButton: '揭露命運',
      webhookLabel: 'Webhook 網址',
      webhookPlaceholder: 'https://discord.com/api/webhooks/…',
      copyShareLink: '複製專屬連結',
      webhookRequired: '請先輸入 Webhook 網址',
      copyShareCopied: '已複製！',
      poolEmptyHint: '獎池內至少要有一項',
      lotteryTitle: '命運揭曉',
      wheelStopped: '命運的輪迴已停止...',
      destinyChosen: '命運選擇了：',
      exileIdLabel: '流亡者 ID：',
      returnBtn: '再次接受命運的召喚',
      exileRequired: '請先輸入流亡者 ID',
      langSelect: '選擇語系',
      volumeMute: '靜音',
      volumeUnmute: '取消靜音',
      volumeSlider: '音量',
      setupScreenAria: '抽獎設定',
      lotteryScreenAria: '抽獎動畫',
      loadingMessage: '正在前往瓦爾克拉斯...',
      skipLoading: '跳過讀取，直接進入命運輪迴（可能造成畫面卡頓）',
    },
    en: {
      pageTitle: 'POE2 Destiny Lottery',
      mainTitle: 'POE2 Destiny Lottery',
      subtitle: 'The wheel of fate awaits your name',
      exileLabel: 'Exile ID',
      exilePlaceholder: 'Enter your Exile ID…',
      drawButton: 'Reveal Destiny',
      webhookLabel: 'Webhook URL',
      webhookPlaceholder: 'https://discord.com/api/webhooks/…',
      copyShareLink: 'Copy Share Link',
      webhookRequired: 'Please enter a Webhook URL first',
      copyShareCopied: 'Copied!',
      poolEmptyHint: 'At least one item must remain in the pool',
      lotteryTitle: 'Destiny Revealed',
      wheelStopped: 'The Wheel of Destiny Has Stopped...',
      destinyChosen: 'Destiny Has Chosen: ',
      exileIdLabel: 'Exile ID: ',
      returnBtn: 'Accept the Call of Destiny Again',
      exileRequired: 'Please enter your Exile ID first',
      langSelect: 'Select language',
      volumeMute: 'Mute volume',
      volumeUnmute: 'Unmute volume',
      volumeSlider: 'Volume',
      setupScreenAria: 'Lottery setup',
      lotteryScreenAria: 'Lottery animation',
      loadingMessage: 'Traveling to Wraeclast...',
      skipLoading: 'Skip loading and enter the wheel of fate (may cause lag)',
    },
  };

  let currentLang = 'zh-TW';
  let lastWinnerId = null;

  /* ── 太鼓音效（Web Audio API 全域狀態，須置頂避免 TDZ）── */

  const DRUM_POOL_SIZE = 16;

  let drumAudioContext = null;
  let drumGainNode = null;
  let drumAudioBuffer = null;
  let useDrumFallback = false;
  const drumPool = [];
  let drumPoolCursor = 0;

  function normalizeLanguageCode(lang) {
    if (!lang) return '';
    return String(lang).toLowerCase().includes('zh') ? 'zh-TW' : 'en';
  }

  function getStorageLanguageCode(lang) {
    return normalizeLanguageCode(lang) === 'zh-TW' ? 'zh' : 'en';
  }

  function getTranslation(lang, key) {
    const parts = key.split('.');
    let value = translations[lang];
    for (const part of parts) {
      if (value == null) return '';
      value = value[part];
    }
    return value ?? '';
  }

  /**
   * 語系對照表 — 獎池類型、UI 標籤（項目名稱改由 data/pools.json 提供）
   */
  const LANGUAGE_MAPPING = {
    poolTypes: {
      Character: { 'zh-TW': '角色', en: 'Character' },
      Ascendancy: { 'zh-TW': '昇華', en: 'Ascendancy' },
      Weapon: { 'zh-TW': '武器', en: 'Weapon' },
    },
    labels: {
      filter: { 'zh-TW': '過濾器', en: 'Filter' },
      poolTypeSwitcher: { 'zh-TW': '獎池類型', en: 'Pool type' },
    },
  };

  function resolveLangText(entry, lang = currentLang) {
    if (!entry || typeof entry !== 'object') return '';
    return entry[lang] || entry.en || '';
  }

  function getPoolTypeName(poolKey, lang = currentLang) {
    return resolveLangText(LANGUAGE_MAPPING.poolTypes[poolKey], lang) || poolKey;
  }

  function getFilterLabel(lang = currentLang) {
    return resolveLangText(LANGUAGE_MAPPING.labels.filter, lang) || 'Filter';
  }

  function getFilterPoolTitle(poolKey = currentPoolKey, lang = currentLang) {
    const typeName = getPoolTypeName(poolKey, lang);
    const filterLabel = getFilterLabel(lang);
    if (lang === 'zh-TW') {
      return `${typeName}${filterLabel}`;
    }
    return `${typeName} ${filterLabel}`;
  }

  function getFilterPoolAriaLabel(poolKey = currentPoolKey, lang = currentLang) {
    return getFilterPoolTitle(poolKey, lang);
  }

  function getPoolItemName(id, poolKey = currentPoolKey, lang = currentLang) {
    const item = getPoolItemById(id, poolKey);
    if (item?.name) {
      return resolveLangText(item.name, lang) || id;
    }
    return id;
  }

  const WEBHOOK_EMBED_COLOR = 13149026; // #C8A362 POE2 亮金色

  function getPoolItemDiscordImage(id, poolKey = lastDrawPoolKey) {
    const item = getPoolItemById(id, poolKey);
    if (!item?.discordImage) return '';
    return String(item.discordImage).trim();
  }

  function buildWebhookEmbed(winnerName, exileId, winnerId) {
    const imageUrl = winnerId ? getPoolItemDiscordImage(winnerId, lastDrawPoolKey) : '';

    const embed = {
      title: currentLang === 'en'
        ? 'The Wheel of Destiny Has Stopped...'
        : '命運之輪已停止...',
      description: currentLang === 'en'
        ? `**Exile ID**: ${exileId}\n**Destiny Has Chosen**: ${winnerName}`
        : `**流亡者 ID**：${exileId}\n**命運選擇了**：${winnerName}`,
      color: WEBHOOK_EMBED_COLOR,
    };

    if (imageUrl) {
      embed.image = { url: imageUrl };
    }

    const footerText = buildWebhookFooterText(getExcludedPoolItemNames(lastDrawPoolKey));
    if (footerText) {
      embed.footer = { text: footerText };
    }

    return embed;
  }

  function updateLanguage(lang) {
    const normalizedLang = normalizeLanguageCode(lang);
    if (!translations[normalizedLang]) return;

    currentLang = normalizedLang;
    document.documentElement.lang = normalizedLang;
    document.title = translations[normalizedLang].pageTitle;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      if (el.dataset.feedbackActive === 'true') return;
      if (el.id === 'filter-pool-title') return;
      const key = el.dataset.i18n;
      el.textContent = getTranslation(normalizedLang, key);
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.dataset.i18nPlaceholder;
      el.placeholder = getTranslation(normalizedLang, key);
    });

    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      if (el.id === 'character-pool') return;
      const key = el.dataset.i18nAria;
      const text = getTranslation(normalizedLang, key);
      el.setAttribute('aria-label', text);
      if (el.hasAttribute('title')) {
        el.title = text;
      }
    });

    const langSelect = document.getElementById('lang-select');
    if (langSelect) {
      langSelect.value = normalizedLang;
      langSelect.setAttribute('aria-label', getTranslation(normalizedLang, 'langSelect'));
    }

    updateFilterPoolNames();
    updateFilterPoolTitle();
    updatePoolSwitcherUI();
    updateWinnerOverlayText();
    updateLotteryTrackLabels();
    updateVolumeUI();
  }

  function updateLotteryTrackLabels() {
    const track = document.getElementById('lottery-track');
    if (!track) return;
    track.querySelectorAll('.lottery-item').forEach((item) => {
      const characterId = item.dataset.id;
      if (!characterId) return;
      const nameEl = item.querySelector('.lottery-item__name');
      const imgEl = item.querySelector('.lottery-item__img');
      const displayName = getPoolItemName(characterId, lastDrawPoolKey || currentPoolKey);
      if (nameEl) nameEl.textContent = displayName;
      if (imgEl) imgEl.alt = displayName;
    });
  }

  function updateWinnerOverlayText() {
    if (!lastWinnerId) return;
    const winnerNameEl = document.getElementById('winner-name');
    if (winnerNameEl) {
      winnerNameEl.textContent = getPoolItemName(lastWinnerId, lastDrawPoolKey);
    }
    const winnerPortraitEl = document.getElementById('winner-portrait');
    if (winnerPortraitEl && lastWinnerId) {
      winnerPortraitEl.alt = getPoolItemName(lastWinnerId, lastDrawPoolKey);
    }
  }

  /* ── 本地狀態儲存（專案專屬前綴，避免同網域衝突）──────────── */

  const STORAGE_KEYS = {
    EXILE_ID: 'poe2_wheel_exileId',
    AUDIO_VOLUME: 'poe2_wheel_audioVolume',
    AUDIO_MUTED: 'poe2_wheel_audioMuted',
    LANGUAGE: 'playerLanguage',
  };

  function readStorageItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (err) {
      console.warn('localStorage 讀取失敗：', err);
      return null;
    }
  }

  function writeStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn('localStorage 寫入失敗：', err);
    }
  }

  function loadExileIdFromStorage() {
    const exileInputEl = document.getElementById('exile-id');
    if (!exileInputEl) return;

    const storedExileId = readStorageItem(STORAGE_KEYS.EXILE_ID);
    if (storedExileId) {
      exileInputEl.value = storedExileId;
    }
  }

  function saveExileIdToStorage(exileId) {
    writeStorageItem(STORAGE_KEYS.EXILE_ID, exileId);
  }

  function getBrowserPreferredLanguage() {
    const browserLang = navigator.language || '';
    return browserLang.toLowerCase().includes('zh') ? 'zh-TW' : 'en';
  }

  function getInitialLanguage() {
    const storedLang = readStorageItem(STORAGE_KEYS.LANGUAGE);
    if (storedLang) {
      return normalizeLanguageCode(storedLang);
    }
    return getBrowserPreferredLanguage();
  }

  function saveLanguagePreference(lang) {
    writeStorageItem(STORAGE_KEYS.LANGUAGE, getStorageLanguageCode(lang));
  }

  /* ── 全域音量管理 ───────────────────────────────────────── */

  const DEFAULT_VOLUME = 0.5;

  const volumeSlider = document.getElementById('volume-slider');
  const volumeMuteBtn = document.getElementById('volume-mute-btn');

  let globalVolume = DEFAULT_VOLUME;
  let volumeSliderMuted = false;

  function loadVolumePreferences() {
    const storedVolume = parseFloat(readStorageItem(STORAGE_KEYS.AUDIO_VOLUME));
    if (Number.isFinite(storedVolume) && storedVolume >= 0 && storedVolume <= 1) {
      globalVolume = storedVolume;
    }

    volumeSliderMuted = readStorageItem(STORAGE_KEYS.AUDIO_MUTED) === 'true';
  }

  function getEffectiveVolume() {
    return volumeSliderMuted ? 0 : globalVolume;
  }

  function updateDrumGain() {
    if (!drumGainNode) return;
    drumGainNode.gain.value = getEffectiveVolume();
  }

  function applyGlobalVolume() {
    const vol = getEffectiveVolume();
    document.querySelectorAll('audio, video').forEach((el) => {
      el.volume = vol;
    });
    updateDrumGain();
  }

  function saveVolumePreferences() {
    writeStorageItem(STORAGE_KEYS.AUDIO_VOLUME, String(globalVolume));
    writeStorageItem(STORAGE_KEYS.AUDIO_MUTED, String(volumeSliderMuted));
  }

  function updateVolumeUI() {
    if (volumeSlider) {
      volumeSlider.value = String(Math.round(globalVolume * 100));
    }
    if (volumeMuteBtn) {
      volumeMuteBtn.classList.toggle('is-muted', volumeSliderMuted);
      const key = volumeSliderMuted ? 'volumeUnmute' : 'volumeMute';
      const label = getTranslation(currentLang, key);
      volumeMuteBtn.setAttribute('aria-label', label);
      volumeMuteBtn.title = label;
    }
  }

  function setGlobalVolume(value) {
    globalVolume = Math.max(0, Math.min(1, value));
    if (globalVolume > 0 && volumeSliderMuted) {
      volumeSliderMuted = false;
    }
    saveVolumePreferences();
    applyGlobalVolume();
    updateVolumeUI();
  }

  function toggleVolumeMute() {
    volumeSliderMuted = !volumeSliderMuted;
    saveVolumePreferences();
    applyGlobalVolume();
    updateVolumeUI();
  }

  function initVolumeControl() {
    loadVolumePreferences();
    updateVolumeUI();
    applyGlobalVolume();

    if (volumeSlider) {
      volumeSlider.addEventListener('input', () => {
        setGlobalVolume(Number(volumeSlider.value) / 100);
      });
      volumeSlider.addEventListener('change', () => {
        setGlobalVolume(Number(volumeSlider.value) / 100);
      });
      volumeSlider.addEventListener('click', (e) => e.stopPropagation());
    }

    if (volumeMuteBtn) {
      volumeMuteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleVolumeMute();
      });
    }
  }

  /* ── 背景音樂 ─────────────────────────────────────────── */

  const bgm = document.getElementById('bgm');
  const endBgm = document.getElementById('end-bgm');
  const langSelect = document.getElementById('lang-select');

  let bgmNeedsUnlock = false;
  let mainBgmWasPlaying = false;

  function isWinnerScreenActive() {
    const overlay = document.getElementById('winner-overlay');
    return overlay && overlay.classList.contains('winner-overlay--visible');
  }

  function tryPlayMainBgm() {
    applyGlobalVolume();
    const playPromise = bgm.play();
    if (playPromise === undefined) return Promise.resolve();
    return playPromise
      .then(() => {
        bgmNeedsUnlock = false;
      })
      .catch(() => {
        bgmNeedsUnlock = true;
      });
  }

  function unlockAudioOnInteraction() {
    resumeDrumAudioContext();
    if (isWinnerScreenActive()) {
      if (endBgm.paused) {
        applyGlobalVolume();
        endBgm.play().catch(() => {});
      }
      return;
    }
    if (bgm.paused || bgmNeedsUnlock) {
      tryPlayMainBgm();
    }
  }

  function switchToEndBgm() {
    mainBgmWasPlaying = !bgm.paused;
    bgm.pause();
    endBgm.loop = true;
    endBgm.currentTime = 0;
    applyGlobalVolume();
    endBgm.play().catch(() => {});
  }

  function restoreMainBgm() {
    endBgm.pause();
    endBgm.currentTime = 0;
    if (mainBgmWasPlaying) {
      applyGlobalVolume();
      bgm.play().catch(() => {});
    }
  }

  langSelect.addEventListener('change', () => {
    updateLanguage(langSelect.value);
    saveLanguagePreference(langSelect.value);
  });

  document.addEventListener('click', unlockAudioOnInteraction);

  initVolumeControl();
  tryPlayMainBgm();

  /* ── 獎池定義與過濾池（資料來源：data/pools.json）────────── */

  const POOLS_JSON_URL = './data/pools.json';

  /** @type {Record<string, { key: string, items: Array<{ id: string, name?: object, iconPath?: string, portraitPath?: string }> }>} */
  let POOLS = {};

  let currentPoolKey = 'Character';
  let lastDrawPoolKey = 'Character';
  let isRolling = false;

  const poolFilterState = {};
  let active_pool = [];

  function resolvePoolAssetPath(path) {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return assetUrl(path);
  }

  function validatePoolItem(item, poolKey, index) {
    const label = `[pools.json] ${poolKey}[${index}]`;

    if (!item || typeof item !== 'object') {
      console.warn(`${label}：項目格式無效，已略過。`, item);
      return false;
    }

    if (typeof item.id !== 'string' || !item.id.trim()) {
      console.warn(`${label}：缺少有效的 id，已略過。`, item);
      return false;
    }

    if (!item.name || typeof item.name !== 'object') {
      console.warn(`${label}（id: ${item.id}）：缺少 name 物件，已略過。`, item);
      return false;
    }

    const hasName = Boolean(item.name['zh-TW'] || item.name.en);
    if (!hasName) {
      console.warn(`${label}（id: ${item.id}）：name 至少需要 zh-TW 或 en，已略過。`, item);
      return false;
    }

    return true;
  }

  function normalizePoolItem(item) {
    const iconPath = item.iconPath || `img_character/icon/icon_${item.id}.webp`;
    const portraitPath = item.portraitPath || `img_character/character/${item.id}.webp`;
    const rawWeight = Number(item.weight);
    const weight = Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : 1;

    return {
      ...item,
      weight,
      discordImage: typeof item.discordImage === 'string' ? item.discordImage.trim() : '',
      iconPath: resolvePoolAssetPath(iconPath),
      portraitPath: resolvePoolAssetPath(portraitPath),
    };
  }

  function buildPoolsFromJson(raw) {
    const pools = {};

    if (!raw || typeof raw !== 'object') {
      console.warn('[pools.json] 根物件格式無效，將使用空獎池。');
      return pools;
    }

    Object.keys(raw).forEach((key) => {
      const sourceItems = raw[key];

      if (!Array.isArray(sourceItems)) {
        console.warn(`[pools.json] ${key}：不是 items 陣列，已視為空池。`);
        pools[key] = { key, items: [] };
        return;
      }

      const seenIds = new Set();
      const items = [];

      sourceItems.forEach((item, index) => {
        if (!validatePoolItem(item, key, index)) return;

        if (seenIds.has(item.id)) {
          console.warn(`[pools.json] ${key}：重複的 id「${item.id}」，已略過。`);
          return;
        }

        seenIds.add(item.id);
        items.push(normalizePoolItem(item));
      });

      pools[key] = { key, items };
    });

    return pools;
  }

  async function loadPoolsFromJson() {
    const response = await fetch(POOLS_JSON_URL);
    if (!response.ok) {
      throw new Error(`無法載入 ${POOLS_JSON_URL}（HTTP ${response.status}）`);
    }

    const raw = await response.json();
    return buildPoolsFromJson(raw);
  }

  function initializePoolState() {
    Object.keys(poolFilterState).forEach((key) => {
      delete poolFilterState[key];
    });

    Object.keys(POOLS).forEach((key) => {
      poolFilterState[key] = POOLS[key].items.map((item) => item.id);
    });

    if (!POOLS[currentPoolKey]) {
      currentPoolKey = Object.keys(POOLS)[0] || 'Character';
    }

    active_pool = poolFilterState[currentPoolKey] || [];
  }

  function getActivePoolDef() {
    return POOLS[currentPoolKey] ?? null;
  }

  function getPoolItemById(id, poolKey = currentPoolKey) {
    return POOLS[poolKey]?.items.find((item) => item.id === id);
  }

  function getPoolItemIconPath(id, poolKey = currentPoolKey) {
    const item = getPoolItemById(id, poolKey);
    if (item?.iconPath) return item.iconPath;
    return assetUrl(`img_character/icon/icon_${id}.webp`);
  }

  function getPoolItemPortraitPath(id, poolKey = currentPoolKey) {
    const item = getPoolItemById(id, poolKey);
    if (item?.portraitPath) return item.portraitPath;
    return assetUrl(`img_character/character/${id}.webp`);
  }

  function getTrackIconPath(characterId) {
    return getPoolItemIconPath(characterId);
  }

  function getRolePortraitPath(characterId) {
    return getPoolItemPortraitPath(characterId, lastDrawPoolKey);
  }

  function isValidPoolItemId(id, poolKey = currentPoolKey) {
    return POOLS[poolKey]?.items.some((item) => item.id === id) ?? false;
  }

  const characterPoolEl = document.getElementById('character-pool');
  const filterPoolTitleEl = document.getElementById('filter-pool-title');
  const poolTypeSwitcherEl = document.getElementById('pool-type-switcher');
  const drawBtn = document.getElementById('draw-btn');
  const drawBtnHint = document.getElementById('draw-btn-hint');

  function updatePoolSwitcherUI() {
    if (!poolTypeSwitcherEl) return;

    poolTypeSwitcherEl.classList.toggle('pool-type-switcher--latin', currentLang === 'en');
    poolTypeSwitcherEl.setAttribute(
      'aria-label',
      resolveLangText(LANGUAGE_MAPPING.labels.poolTypeSwitcher, currentLang) || 'Pool type',
    );

    const track = poolTypeSwitcherEl.querySelector('.pool-type-switcher__track');
    const indicator = poolTypeSwitcherEl.querySelector('.pool-type-switcher__indicator');
    const buttons = poolTypeSwitcherEl.querySelectorAll('.pool-type-switcher__btn');
    let activeBtn = null;

    buttons.forEach((btn) => {
      const poolKey = btn.dataset.pool;
      if (poolKey) {
        btn.textContent = getPoolTypeName(poolKey, currentLang);
      }

      const isActive = poolKey === currentPoolKey;
      btn.classList.toggle('pool-type-switcher__btn--active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
      if (isActive) activeBtn = btn;
    });

    if (activeBtn && indicator && track) {
      const trackRect = track.getBoundingClientRect();
      const btnRect = activeBtn.getBoundingClientRect();
      indicator.style.width = `${btnRect.width}px`;
      indicator.style.transform = `translateX(${btnRect.left - trackRect.left}px)`;
    }
  }

  function updatePoolSwitcherState() {
    if (!poolTypeSwitcherEl) return;

    const disabled = isRolling;
    poolTypeSwitcherEl.classList.toggle('pool-type-switcher--locked', disabled);
    poolTypeSwitcherEl.querySelectorAll('.pool-type-switcher__btn').forEach((btn) => {
      btn.disabled = disabled;
      btn.setAttribute('aria-disabled', String(disabled));
    });
  }

  function switchPoolType(poolKey) {
    if (isRolling || !POOLS[poolKey] || poolKey === currentPoolKey) return;

    currentPoolKey = poolKey;
    active_pool = poolFilterState[poolKey];

    updatePoolSwitcherUI();
    updateFilterPoolTitle();
    renderFilterPool();
    updateDrawButton();
  }

  function initPoolTypeSwitcher() {
    if (!poolTypeSwitcherEl) return;

    poolTypeSwitcherEl.querySelectorAll('.pool-type-switcher__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchPoolType(btn.dataset.pool);
      });
    });

    window.addEventListener('resize', () => {
      updatePoolSwitcherUI();
    });

    updatePoolSwitcherUI();
    updatePoolSwitcherState();

    requestAnimationFrame(() => {
      updatePoolSwitcherUI();
    });
  }

  function renderFilterPool() {
    if (!characterPoolEl) return;

    const poolDef = getActivePoolDef();
    if (!poolDef?.items?.length) {
      characterPoolEl.innerHTML = '';
      return;
    }

    characterPoolEl.innerHTML = '';

    poolDef.items.forEach((item) => {
      const itemName = getPoolItemName(item.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'character-icon';
      btn.dataset.id = item.id;
      btn.title = itemName;
      btn.setAttribute('aria-label', itemName);
      btn.setAttribute('aria-pressed', 'true');

      const img = document.createElement('img');
      img.className = 'character-icon__img';
      img.src = getPoolItemIconPath(item.id);
      img.alt = itemName;
      img.width = 800;
      img.height = 600;

      const name = document.createElement('span');
      name.className = 'character-icon__name';
      name.textContent = itemName;

      btn.appendChild(img);
      btn.appendChild(name);
      btn.addEventListener('click', () => togglePoolItem(item.id));
      characterPoolEl.appendChild(btn);
    });

    syncFilterPoolIcons();
  }

  function updateFilterPoolTitle() {
    const titleText = getFilterPoolTitle(currentPoolKey, currentLang);
    const ariaText = getFilterPoolAriaLabel(currentPoolKey, currentLang);

    if (filterPoolTitleEl) {
      filterPoolTitleEl.textContent = titleText;
    }

    if (characterPoolEl) {
      characterPoolEl.setAttribute('aria-label', ariaText);
    }
  }

  function updateFilterPoolNames() {
    if (!characterPoolEl) return;

    characterPoolEl.querySelectorAll('.character-icon').forEach((btn) => {
      const id = btn.dataset.id;
      const itemName = getPoolItemName(id);
      const nameEl = btn.querySelector('.character-icon__name');
      const imgEl = btn.querySelector('.character-icon__img');

      if (nameEl) nameEl.textContent = itemName;
      if (imgEl) imgEl.alt = itemName;
      btn.title = itemName;
      btn.setAttribute('aria-label', itemName);
    });
  }

  function syncFilterPoolIcons() {
    if (!characterPoolEl) return;

    characterPoolEl.querySelectorAll('.character-icon').forEach((btn) => {
      const id = btn.dataset.id;
      const inPool = active_pool.includes(id);
      btn.classList.toggle('character-icon--excluded', !inPool);
      btn.setAttribute('aria-pressed', String(inPool));
    });
  }

  function togglePoolItem(id) {
    if (active_pool.includes(id)) {
      const index = active_pool.indexOf(id);
      active_pool.splice(index, 1);
    } else {
      active_pool.push(id);
    }
    syncFilterPoolIcons();
    updateDrawButton();
  }

  function updateDrawButton() {
    if (!drawBtn || !drawBtnHint) return;

    const isEmpty = active_pool.length === 0;
    drawBtn.disabled = isEmpty || isRolling;
    drawBtnHint.hidden = !isEmpty;
  }

  function getExcludedPoolItemNames(poolKey = lastDrawPoolKey || currentPoolKey) {
    const pool = POOLS[poolKey];
    if (!pool) return [];

    const enabledIds = poolFilterState[poolKey];
    return pool.items
      .filter((item) => !enabledIds.includes(item.id))
      .map((item) => getPoolItemName(item.id, poolKey));
  }

  function buildWebhookFooterText(excludedItems) {
    if (excludedItems.length === 0) {
      return '';
    }
    return currentLang === 'en'
      ? `Excluded by destiny: ${excludedItems.join(', ')}`
      : `已被命運排除：${excludedItems.join(', ')}`;
  }

  function initializePoolUI() {
    initPoolTypeSwitcher();
    renderFilterPool();
    updateFilterPoolTitle();
    updateDrawButton();
    updateLanguage(getInitialLanguage());
  }

  async function bootstrapApp() {
    try {
      POOLS = await loadPoolsFromJson();
      initializePoolState();
      initializePoolUI();
    } catch (err) {
      console.error('獎池資料載入失敗：', err);
      POOLS = { Character: { key: 'Character', items: [] } };
      initializePoolState();
      initializePoolUI();
    }

    initAssetPreloader();
  }

  /* ── 畫面切換（Fade In / Out）──────────────────────────── */

  const setupScreen = document.getElementById('setup-screen');
  const lotteryScreen = document.getElementById('lottery-screen');
  const lotteryTrack = document.getElementById('lottery-track');
  const lotteryWindow = document.querySelector('.lottery-window');
  const exileInput = document.getElementById('exile-id');
  const webhookInput = document.getElementById('webhook-url');
  const copyShareBtn = document.getElementById('copy-share-btn');
  const winnerOverlay = document.getElementById('winner-overlay');
  const winnerNameEl = document.getElementById('winner-name');
  const winnerPortraitEl = document.getElementById('winner-portrait');
  const winnerExileEl = document.getElementById('winner-exile-id');
  const winnerReturnBtn = document.getElementById('winner-return-btn');
  const transitionVideo = document.getElementById('reveal-transition-video');
  const portraitBgVideo = document.getElementById('portrait-bg-video');

  const SCREEN_TRANSITION_MS = 700;

  let copyShareFeedbackTimer = null;

  function loadWebhookFromUrl() {
    if (!webhookInput) return;

    const encodedWebhook = new URLSearchParams(window.location.search).get('w');
    if (!encodedWebhook) return;

    try {
      const decodedWebhook = atob(encodedWebhook).trim();
      if (decodedWebhook) {
        webhookInput.value = decodedWebhook;
      }
    } catch (err) {
      console.warn('Webhook URL 參數解碼失敗：', err);
    }
  }

  function buildWebhookShareUrl(webhookUrl) {
    const baseUrl = window.location.origin + window.location.pathname;
    const encodedWebhook = btoa(webhookUrl);
    return `${baseUrl}?w=${encodedWebhook}`;
  }

  async function copyTextToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  function showCopyShareFeedback() {
    if (!copyShareBtn) return;

    copyShareBtn.textContent = getTranslation(currentLang, 'copyShareCopied');
    copyShareBtn.dataset.feedbackActive = 'true';
    copyShareBtn.classList.add('btn-copy-share--copied');

    clearTimeout(copyShareFeedbackTimer);
    copyShareFeedbackTimer = setTimeout(() => {
      copyShareBtn.dataset.feedbackActive = 'false';
      copyShareBtn.classList.remove('btn-copy-share--copied');
      copyShareBtn.textContent = getTranslation(currentLang, 'copyShareLink');
    }, 2000);
  }

  async function handleCopyShareLink() {
    if (!webhookInput || !copyShareBtn) return;

    const webhookUrl = webhookInput.value.trim();
    if (!webhookUrl) {
      alert(getTranslation(currentLang, 'webhookRequired'));
      return;
    }

    try {
      const shareUrl = buildWebhookShareUrl(webhookUrl);
      await copyTextToClipboard(shareUrl);
      showCopyShareFeedback();
    } catch (err) {
      console.warn('複製專屬連結失敗：', err);
    }
  }

  loadWebhookFromUrl();
  loadExileIdFromStorage();
  if (copyShareBtn) {
    copyShareBtn.addEventListener('click', handleCopyShareLink);
  }

  /* ── 抽獎動畫常數 ───────────────────────────────────────── */

  const CARD_WIDTH = 220;
  const WINNER_INDEX = 50;
  const TOTAL_CARDS = 60;
  const SCROLL_DURATION_MS = 7000;
  const REVEAL_DELAY_MS = 1000;
  const VIEWPORT_WIDTH = 800;

  let lastExileId = '';
  let scrollEndHandler = null;
  let scrollFallbackTimer = null;
  let revealTriggered = false;
  let drumMonitorRafId = null;
  let revealFlashTimer = null;
  let transitionEndedHandler = null;
  let winnerContentRevealed = false;

  const SCROLL_EASING = 'cubic-bezier(0.05, 0.9, 0.1, 1)';

  /* ── 太鼓音效（Web Audio API + HTMLAudio 降級）──────────── */

  function getDrumAudioContext() {
    if (drumAudioContext) return drumAudioContext;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;

      drumAudioContext = new AudioContextClass();
      drumGainNode = drumAudioContext.createGain();
      drumGainNode.connect(drumAudioContext.destination);
      updateDrumGain();
      return drumAudioContext;
    } catch (err) {
      console.warn('AudioContext 建立失敗：', err);
      return null;
    }
  }

  function resumeDrumAudioContext() {
    if (useDrumFallback) return;

    try {
      const ctx = getDrumAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch (err) {
      console.warn('AudioContext 恢復失敗：', err);
    }
  }

  function initDrumFallbackPool() {
    drumPool.length = 0;
    for (let i = 0; i < DRUM_POOL_SIZE; i++) {
      const audio = new Audio(DRUM_SRC);
      audio.preload = 'auto';
      drumPool.push(audio);
    }
    useDrumFallback = true;
    drumAudioBuffer = null;
  }

  function preloadDrumFallback() {
    return new Promise((resolve) => {
      try {
        initDrumFallbackPool();
        if (drumPool.length === 0) {
          resolve();
          return;
        }

        let settled = false;
        let loadedCount = 0;

        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };

        const markLoaded = () => {
          loadedCount += 1;
          if (loadedCount >= drumPool.length) {
            finish();
          }
        };

        drumPool.forEach((audio) => {
          audio.addEventListener('canplaythrough', markLoaded, { once: true });
          audio.addEventListener('error', markLoaded, { once: true });
          audio.src = DRUM_SRC;
          audio.load();
        });

        setTimeout(finish, 3000);
      } catch (err) {
        console.warn('鼓聲 HTMLAudio 降級預載失敗：', err);
        resolve();
      }
    });
  }

  async function preloadDrumBuffer() {
    try {
      const response = await fetch(DRUM_SRC);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const ctx = getDrumAudioContext();
      if (!ctx) {
        throw new Error('AudioContext unavailable');
      }

      drumAudioBuffer = await ctx.decodeAudioData(arrayBuffer);
      useDrumFallback = false;
    } catch (err) {
      console.warn('鼓聲 Web Audio 預解碼失敗，降級為 HTMLAudio：', err);
      await preloadDrumFallback();
    }
  }

  function playDrumSoundWithFallback() {
    const audio = drumPool[drumPoolCursor];
    drumPoolCursor = (drumPoolCursor + 1) % drumPool.length;
    audio.currentTime = 0;
    audio.volume = getEffectiveVolume();
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {});
    }
  }

  function playDrumSound() {
    if (useDrumFallback) {
      if (drumPool.length === 0) return;
      playDrumSoundWithFallback();
      return;
    }

    if (!drumAudioBuffer) {
      if (drumPool.length > 0) {
        playDrumSoundWithFallback();
      }
      return;
    }

    try {
      const ctx = getDrumAudioContext();
      if (!ctx || !drumGainNode) {
        if (drumPool.length > 0) {
          playDrumSoundWithFallback();
        }
        return;
      }

      resumeDrumAudioContext();
      updateDrumGain();

      const source = ctx.createBufferSource();
      source.buffer = drumAudioBuffer;
      source.connect(drumGainNode);
      source.start(0);
    } catch (err) {
      console.warn('鼓聲 Web Audio 播放失敗，降級為 HTMLAudio：', err);
      if (drumPool.length === 0) {
        initDrumFallbackPool();
      }
      if (drumPool.length > 0) {
        playDrumSoundWithFallback();
      }
    }
  }

  function parseTranslateX(element) {
    const transform = window.getComputedStyle(element).transform;
    if (!transform || transform === 'none') return 0;

    if (transform.startsWith('matrix3d(')) {
      const values = transform.slice(9, -1).split(',').map((v) => parseFloat(v.trim()));
      return Number.isFinite(values[12]) ? values[12] : 0;
    }

    if (transform.startsWith('matrix(')) {
      const values = transform.slice(7, -1).split(',').map((v) => parseFloat(v.trim()));
      return Number.isFinite(values[4]) ? values[4] : 0;
    }

    return 0;
  }

  function getPointerCardIndex(translateX, slotWidth) {
    const center = getViewportCenter();
    const index = Math.round((center - translateX - slotWidth / 2) / slotWidth);
    return Math.max(0, index);
  }

  function stopDrumMonitor() {
    if (drumMonitorRafId !== null) {
      cancelAnimationFrame(drumMonitorRafId);
      drumMonitorRafId = null;
    }
  }

  function startDrumMonitor(initialTranslateX) {
    stopDrumMonitor();

    const slotWidth = getCardWidth();
    let lastTriggeredIndex = getPointerCardIndex(initialTranslateX, slotWidth);

    function monitorFrame() {
      const translateX = parseTranslateX(lotteryTrack);
      const currentIndex = getPointerCardIndex(translateX, slotWidth);

      if (currentIndex !== lastTriggeredIndex) {
        playDrumSound();
        lastTriggeredIndex = currentIndex;
      }

      drumMonitorRafId = requestAnimationFrame(monitorFrame);
    }

    drumMonitorRafId = requestAnimationFrame(monitorFrame);
  }

  applyGlobalVolume();

  function getPoolItemWeight(id, poolKey = currentPoolKey) {
    const item = getPoolItemById(id, poolKey);
    const weight = item?.weight;
    if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
      return weight;
    }
    return 1;
  }

  function pickRandomFromPool() {
    if (active_pool.length === 0) return undefined;

    const weightedEntries = active_pool.map((id) => ({
      id,
      weight: getPoolItemWeight(id, currentPoolKey),
    }));

    const totalWeight = weightedEntries.reduce((sum, entry) => sum + entry.weight, 0);
    if (totalWeight <= 0) {
      return active_pool[Math.floor(Math.random() * active_pool.length)];
    }

    let threshold = Math.random() * totalWeight;
    for (const entry of weightedEntries) {
      threshold -= entry.weight;
      if (threshold < 0) {
        return entry.id;
      }
    }

    return weightedEntries[weightedEntries.length - 1].id;
  }

  function buildTrackCards(winnerId) {
    const cards = [];
    for (let i = 0; i < TOTAL_CARDS; i++) {
      cards.push(i === WINNER_INDEX ? winnerId : pickRandomFromPool());
    }
    return cards;
  }

  function renderLotteryTrack(cards) {
    lotteryTrack.innerHTML = '';
    lotteryTrack.classList.remove('lottery-window__track--rolling');
    lotteryTrack.style.transition = 'none';
    lotteryTrack.style.transform = 'translateX(0)';

    cards.forEach((rawId) => {
      if (!isValidPoolItemId(rawId, lastDrawPoolKey)) return;

      const characterId = rawId;
      const displayName = getPoolItemName(characterId, lastDrawPoolKey);

      const item = document.createElement('div');
      item.className = 'lottery-item';
      item.dataset.id = characterId;

      const img = document.createElement('img');
      img.className = 'lottery-item__img';
      img.src = getPoolItemIconPath(characterId, lastDrawPoolKey);
      img.alt = displayName;

      const name = document.createElement('span');
      name.className = 'lottery-item__name';
      name.textContent = displayName;

      item.appendChild(img);
      item.appendChild(name);
      lotteryTrack.appendChild(item);
    });
  }

  function getViewportCenter() {
    const w = lotteryWindow ? lotteryWindow.offsetWidth : 0;
    const width = w > 0 ? w : VIEWPORT_WIDTH;
    return width / 2;
  }

  function getCardWidth() {
    const first = lotteryTrack.querySelector('.lottery-item');
    if (!first) return CARD_WIDTH;
    const style = getComputedStyle(first);
    const marginLeft = parseFloat(style.marginLeft) || 0;
    const marginRight = parseFloat(style.marginRight) || 0;
    const total = first.offsetWidth + marginLeft + marginRight;
    return Number.isFinite(total) && total > 0 ? total : CARD_WIDTH;
  }

  function calcTranslateX(cardIndex, offsetPx) {
    const center = getViewportCenter();
    const slotWidth = getCardWidth();
    const cardCenter = cardIndex * slotWidth + slotWidth / 2;
    const result = center - cardCenter + offsetPx;
    return Number.isFinite(result) ? result : 0;
  }

  function clearScrollListeners() {
    stopDrumMonitor();
    if (scrollEndHandler) {
      lotteryTrack.removeEventListener('transitionend', scrollEndHandler);
      scrollEndHandler = null;
    }
    if (scrollFallbackTimer) {
      clearTimeout(scrollFallbackTimer);
      scrollFallbackTimer = null;
    }
  }

  function runScrollAnimation(winnerId, exileId) {
    const itemCount = lotteryTrack.querySelectorAll('.lottery-item').length;
    if (itemCount === 0) {
      isRolling = false;
      updatePoolSwitcherState();
      updateDrawButton();
      return;
    }

    const randomOffset = (Math.random() * 80) - 40;
    const startX = calcTranslateX(0, 0);
    const targetX = calcTranslateX(WINNER_INDEX, randomOffset);

    if (!Number.isFinite(targetX)) {
      isRolling = false;
      updatePoolSwitcherState();
      updateDrawButton();
      return;
    }

    clearScrollListeners();
    revealTriggered = false;

    lotteryTrack.classList.remove('lottery-window__track--rolling');
    lotteryTrack.style.transition = 'none';
    lotteryTrack.style.transform = `translateX(${startX}px)`;

    /* 強制 reflow，確保起始位置被瀏覽器登錄 */
    void lotteryTrack.offsetHeight;

    const onReveal = () => {
      if (revealTriggered) return;
      revealTriggered = true;
      clearScrollListeners();
      beginRevealSequence(winnerId, exileId);
    };

    scrollEndHandler = (e) => {
      if (e.target !== lotteryTrack || e.propertyName !== 'transform') return;
      onReveal();
    };

    lotteryTrack.addEventListener('transitionend', scrollEndHandler);

    /* transitionend 未觸發時的保險機制 */
    scrollFallbackTimer = setTimeout(onReveal, SCROLL_DURATION_MS + 150);

    requestAnimationFrame(() => {
      lotteryTrack.style.transition = `transform ${SCROLL_DURATION_MS}ms ${SCROLL_EASING}`;
      lotteryTrack.style.transform = `translateX(${targetX}px)`;
      startDrumMonitor(startX);
    });
  }

  function clearRevealVfx() {
    if (revealFlashTimer) {
      clearTimeout(revealFlashTimer);
      revealFlashTimer = null;
    }
    if (transitionEndedHandler && transitionVideo) {
      transitionVideo.removeEventListener('ended', transitionEndedHandler);
      transitionEndedHandler = null;
    }
    if (transitionVideo) {
      transitionVideo.pause();
      transitionVideo.currentTime = 0;
      transitionVideo.classList.remove('vfx-transition--active');
    }
    if (portraitBgVideo) {
      portraitBgVideo.pause();
      portraitBgVideo.currentTime = 0;
      portraitBgVideo.classList.remove('bg-glow-video--active');
    }
    if (winnerPortraitEl) {
      winnerPortraitEl.classList.remove('winner-overlay__portrait--revealed');
    }
  }

  function beginRevealSequence(winnerId, exileId) {
    lastWinnerId = winnerId;
    lastExileId = exileId;
    winnerContentRevealed = false;

    const charName = getPoolItemName(winnerId, lastDrawPoolKey);
    winnerNameEl.textContent = charName;
    winnerPortraitEl.src = getPoolItemPortraitPath(winnerId, lastDrawPoolKey);
    winnerPortraitEl.alt = charName;
    winnerExileEl.textContent = exileId;

    hideWinnerOverlay();
    clearRevealVfx();

    switchToEndBgm();

    if (transitionVideo) {
      transitionVideo.loop = false;
      transitionVideo.currentTime = 0;
      transitionVideo.classList.add('vfx-transition--active');

      transitionEndedHandler = () => {
        if (transitionVideo) {
          transitionVideo.removeEventListener('ended', transitionEndedHandler);
          transitionVideo.classList.remove('vfx-transition--active');
          transitionVideo.pause();
        }
        transitionEndedHandler = null;
      };

      transitionVideo.addEventListener('ended', transitionEndedHandler);

      revealFlashTimer = setTimeout(() => {
        revealFlashTimer = null;
        revealWinnerContent(winnerId, exileId, charName);
      }, REVEAL_DELAY_MS);

      transitionVideo.play().catch(() => {});
    } else {
      revealWinnerContent(winnerId, exileId, charName);
    }

    isRolling = false;
    updatePoolSwitcherState();
  }

  function revealWinnerContent(winnerId, exileId, charName) {
    if (winnerContentRevealed) return;
    winnerContentRevealed = true;

    winnerOverlay.classList.add('winner-overlay--visible');
    winnerOverlay.setAttribute('aria-hidden', 'false');
    winnerPortraitEl.classList.add('winner-overlay__portrait--revealed');

    if (portraitBgVideo) {
      playPortraitBgVideo();
    }

    const webhookUrl = webhookInput.value.trim();
    if (webhookUrl) {
      sendDiscordWebhook(webhookUrl, charName, exileId, winnerId);
    }
  }

  function showWinnerOverlay(winnerId, exileId) {
    beginRevealSequence(winnerId, exileId);
  }

  function hideWinnerOverlay() {
    winnerOverlay.classList.remove('winner-overlay--visible');
    winnerOverlay.setAttribute('aria-hidden', 'true');
    if (winnerPortraitEl) {
      winnerPortraitEl.classList.remove('winner-overlay__portrait--revealed');
    }
  }

  function resetRevealState() {
    clearRevealVfx();
    hideWinnerOverlay();
    restoreMainBgm();
  }

  function clearRevealForRedraw() {
    winnerContentRevealed = false;
    clearRevealVfx();
    hideWinnerOverlay();
    endBgm.pause();
    endBgm.currentTime = 0;
  }

  function resetLotteryTrack() {
    clearScrollListeners();
    lotteryTrack.classList.remove('lottery-window__track--rolling');
    lotteryTrack.style.transition = 'none';
    lotteryTrack.style.transform = 'translateX(0)';
    lotteryTrack.innerHTML = '';
  }

  async function sendDiscordWebhook(webhookUrl, winnerName, exileId, winnerId) {
    try {
      const payload = {
        embeds: [buildWebhookEmbed(winnerName, exileId, winnerId)],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        console.warn('Discord Webhook 發送失敗：', response.status, response.statusText);
      }
    } catch (err) {
      console.warn('Discord Webhook 發送失敗：', err);
    }
  }

  function startLottery() {
    if (isRolling) return;

    const exileId = exileInput.value.trim();
    if (!exileId) {
      alert(getTranslation(currentLang, 'exileRequired'));
      return;
    }

    if (drawBtn.disabled || active_pool.length === 0) return;

    saveExileIdToStorage(exileId);

    unlockAudioOnInteraction();

    lastDrawPoolKey = currentPoolKey;

    isRolling = true;
    updatePoolSwitcherState();
    drawBtn.disabled = true;
    clearRevealForRedraw();

    const winnerId = pickRandomFromPool();
    const cards = buildTrackCards(winnerId);
    renderLotteryTrack(cards);

    switchScreen(setupScreen, lotteryScreen);

    setTimeout(() => {
      void lotteryWindow.offsetWidth;
      void lotteryTrack.offsetWidth;
      runScrollAnimation(winnerId, exileId);
    }, SCREEN_TRANSITION_MS + 200);
  }

  function returnToSetup() {
    resetRevealState();
    resetLotteryTrack();

    lotteryScreen.classList.remove('screen--active');
    lotteryScreen.classList.add('screen--leaving');
    lotteryScreen.setAttribute('aria-hidden', 'true');

    setupScreen.classList.add('screen--entering');
    setupScreen.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      lotteryScreen.classList.remove('screen--leaving', 'screen--entering');
      setupScreen.classList.remove('screen--entering');
      setupScreen.classList.add('screen--active');
      isRolling = false;
      updatePoolSwitcherState();
      updateDrawButton();
    }, SCREEN_TRANSITION_MS);
  }

  function switchScreen(fromEl, toEl) {
    fromEl.classList.remove('screen--active');
    fromEl.classList.add('screen--leaving');
    fromEl.setAttribute('aria-hidden', 'true');

    toEl.classList.add('screen--entering');
    toEl.setAttribute('aria-hidden', 'false');

    setTimeout(() => {
      fromEl.classList.remove('screen--leaving');
      toEl.classList.remove('screen--entering');
      toEl.classList.add('screen--active');
    }, SCREEN_TRANSITION_MS);
  }

  /* ── 資源預載畫面 ───────────────────────────────────────── */

  function collectPreloadAssets() {
    const assets = [];

    (POOLS.Character?.items || []).forEach((item) => {
      assets.push({ type: 'image', src: getPoolItemIconPath(item.id, 'Character') });
      assets.push({ type: 'image', src: getPoolItemPortraitPath(item.id, 'Character') });
    });

    [BGM_MAIN_SRC, BGM_END_SRC].forEach((src) => {
      assets.push({ type: 'audio', src });
    });

    assets.push({ type: 'drum-buffer', src: DRUM_SRC });

    const bgVideoEl = document.querySelector('.bg-video');
    const transitionVideoEl = document.getElementById('reveal-transition-video');
    const portraitVideoEl = document.getElementById('portrait-bg-video');

    normalizeVideoSource(bgVideoEl, BACKGROUND_VIDEO_SRC);
    normalizeVideoSource(transitionVideoEl, REVEAL_TRANSITION_VIDEO_SRC);
    normalizeVideoSource(portraitVideoEl, PORTRAIT_BG_VIDEO_SRC);

    assets.push({ type: 'video', src: BACKGROUND_VIDEO_SRC, element: bgVideoEl });
    assets.push({ type: 'video', src: REVEAL_TRANSITION_VIDEO_SRC, element: transitionVideoEl });
    assets.push({ type: 'video', src: PORTRAIT_BG_VIDEO_SRC, element: portraitVideoEl });

    return assets;
  }

  function preloadImageAsset(src) {
    return new Promise((resolve) => {
      const img = new Image();
      const finish = () => resolve();
      img.onload = finish;
      img.onerror = finish;
      img.src = src;
    });
  }

  function preloadAudioAsset(src) {
    return new Promise((resolve) => {
      const audio = new Audio();
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        audio.removeAttribute('src');
        audio.load();
        resolve();
      };

      audio.addEventListener('canplaythrough', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });
      audio.preload = 'auto';
      audio.src = src;
      audio.load();
    });
  }

  function preloadVideoAsset(src, videoEl) {
    return new Promise((resolve) => {
      try {
        if (videoEl) {
          let settled = false;

          const finish = () => {
            if (settled) return;
            settled = true;
            resolve();
          };

          videoEl.addEventListener('canplaythrough', finish, { once: true });
          videoEl.addEventListener('error', finish, { once: true });
          videoEl.preload = 'auto';
          videoEl.load();

          if (videoEl.readyState >= 4) {
            finish();
            return;
          }

          setTimeout(finish, 8000);
          return;
        }

        fetch(src)
          .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.blob();
          })
          .then(() => resolve())
          .catch(() => resolve());
      } catch (err) {
        console.warn('影片預載失敗：', src, err);
        resolve();
      }
    });
  }

  function preloadAsset(asset) {
    try {
      if (asset.type === 'image') {
        return preloadImageAsset(asset.src);
      }
      if (asset.type === 'audio') {
        return preloadAudioAsset(asset.src);
      }
      if (asset.type === 'drum-buffer') {
        return preloadDrumBuffer();
      }
      if (asset.type === 'video') {
        return preloadVideoAsset(asset.src, asset.element);
      }
    } catch (err) {
      console.warn('資源預載啟動失敗：', asset, err);
    }

    return Promise.resolve();
  }

  function safePreloadAsset(asset) {
    return Promise.resolve()
      .then(() => preloadAsset(asset))
      .catch((err) => {
        console.warn('資源預載失敗：', asset, err);
      });
  }

  function initAssetPreloader() {
    const loadingScreen = document.getElementById('loading-screen');
    const progressBar = document.getElementById('loading-progress-bar');
    const progressText = document.getElementById('loading-progress-text');
    const skipLoadingBtn = document.getElementById('skip-loading-btn');
    if (!loadingScreen) return;

    let assets = [];

    try {
      assets = collectPreloadAssets();
    } catch (err) {
      console.warn('預載資源清單建立失敗：', err);
      loadingScreen.classList.add('loading-screen--hidden');
      loadingScreen.setAttribute('aria-busy', 'false');
      return;
    }

    const totalAssets = assets.length;
    let completedAssets = 0;
    let loadingDismissed = false;

    function updatePreloadProgress() {
      const percent = totalAssets === 0
        ? 100
        : Math.min(100, Math.round((completedAssets / totalAssets) * 100));

      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
      if (progressText) {
        progressText.textContent = `${percent}%`;
      }
    }

    function dismissLoadingScreen(forceComplete = false) {
      if (loadingDismissed) return;
      loadingDismissed = true;

      if (forceComplete) {
        if (progressBar) {
          progressBar.style.width = '100%';
        }
        if (progressText) {
          progressText.textContent = '100%';
        }
      }

      loadingScreen.classList.add('loading-screen--hidden');
      loadingScreen.setAttribute('aria-busy', 'false');

      setTimeout(() => {
        loadingScreen.remove();
      }, 750);
    }

    function markAssetLoaded() {
      completedAssets += 1;
      updatePreloadProgress();
      if (completedAssets >= totalAssets) {
        dismissLoadingScreen(true);
      }
    }

    updatePreloadProgress();

    if (totalAssets === 0) {
      dismissLoadingScreen(true);
      return;
    }

    if (skipLoadingBtn) {
      setTimeout(() => {
        skipLoadingBtn.classList.add('loading-screen__skip--visible');
      }, 3000);

      skipLoadingBtn.addEventListener('click', () => {
        dismissLoadingScreen(false);
      });
    }

    assets.forEach((asset) => {
      safePreloadAsset(asset).finally(markAssetLoaded);
    });
  }

  function playPortraitBgVideo() {
    if (!portraitBgVideo || !winnerOverlay) return;

    portraitBgVideo.loop = true;
    portraitBgVideo.muted = true;
    portraitBgVideo.playsInline = true;
    portraitBgVideo.currentTime = 0;
    portraitBgVideo.classList.add('bg-glow-video--active');

    const attemptPlayback = () => {
      const playPromise = portraitBgVideo.play();
      if (playPromise === undefined) return;

      playPromise.catch((err) => {
        console.warn('結算背景影片播放失敗，嘗試重新載入：', err);
        portraitBgVideo.load();
        portraitBgVideo.play().catch((retryErr) => {
          console.warn('結算背景影片重試播放失敗：', retryErr);
        });
      });
    };

    const startPlayback = () => {
      requestAnimationFrame(() => {
        attemptPlayback();
      });
    };

    if (portraitBgVideo.readyState >= 3) {
      startPlayback();
      return;
    }

    portraitBgVideo.addEventListener('canplaythrough', startPlayback, { once: true });
    portraitBgVideo.addEventListener('error', () => {
      console.warn('結算背景影片載入錯誤：', portraitBgVideo.error);
    }, { once: true });
    portraitBgVideo.load();
  }

  bootstrapApp();

  if (drawBtn) {
    drawBtn.addEventListener('click', startLottery);
  }
  if (winnerReturnBtn) {
    winnerReturnBtn.addEventListener('click', returnToSetup);
  }

  /* 匯出供後續模組使用 */
  window.POE2Lottery = {
    switchScreen,
    showSetup: returnToSetup,
    showLottery: () => switchScreen(setupScreen, lotteryScreen),
    startLottery,
    updateLanguage,
    get active_pool() { return active_pool; },
    get currentLang() { return currentLang; },
    applyGlobalVolume,
    setGlobalVolume,
    getGlobalVolume: () => globalVolume,
    getTrackIconPath,
    getRolePortraitPath,
    getPoolItemName,
    getFilterPoolTitle,
    getPoolTypeName,
    getActivePoolDef,
    get POOLS() { return POOLS; },
    get CHARACTERS() { return POOLS.Character?.items || []; },
    get currentPoolKey() { return currentPoolKey; },
    LANGUAGE_MAPPING,
    translations,
  };
})();
