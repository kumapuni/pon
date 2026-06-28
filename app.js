// グローバル状態
const state = {
  playlists: {}, // { playlistId: { name, items: [{ id, name, audioBuffer, isSelected, volume, loop: false, startTime: 0 }] } }
  currentPlaylistId: null,
  audioContext: null,
  audioNodes: new Map(), // id -> { sourceNode, gainNode, analyserNode, biquadFilters, startTime, duration }
  outputDevice: null,
  currentPlayIndex: -1,
  playStartTime: 0,
  playInterval: null,
  dragSourceIndex: -1,
  isPaused: false,
  pauseOffset: 0, // 一時停止時の経過時間オフセット
  loopAll: false,
  loopOne: false,
  meterInterval: null,
  eq: {
    low: 0,   // dB
    mid: 0,   // dB
    high: 0,  // dB
  },
  meterPeak: -60, // ピークホールド値 (dB)
  meterLastUpdate: 0,
  eqPresets: {}, // { presetName: { low, mid, high } }
  spectrumInterval: null,
  isPlaying: false, // 再生中かどうかのフラグ（停止中に誤再生を防ぐ）
};

// DOM要素
const headerClock = document.getElementById('headerClock');
const headerStatus = document.getElementById('headerStatus');
const nowPlayingTitle = document.getElementById('nowPlayingTitle');
const nowPlayingProgressFill = document.getElementById('nowPlayingProgressFill');
const meterFill = document.getElementById('meterFill');
const meterLabel = document.getElementById('meterLabel');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const deviceSelect = document.getElementById('deviceSelect');
const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');
const playlistSelect = document.getElementById('playlistSelect');
const newPlaylistBtn = document.getElementById('newPlaylistBtn');
const renamePlaylistBtn = document.getElementById('renamePlaylistBtn');
const deletePlaylistBtn = document.getElementById('deletePlaylistBtn');
const playlistEl = document.getElementById('playlist');
const playSelectedBtn = document.getElementById('playSelectedBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const stopAllBtn = document.getElementById('stopAllBtn');
const loopAllCheckbox = document.getElementById('loopAllCheckbox');
const loopOneCheckbox = document.getElementById('loopOneCheckbox');
const statusEl = document.getElementById('status');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const nextInfo = document.getElementById('nextInfo');
const eqLow = document.getElementById('eqLow');
const eqMid = document.getElementById('eqMid');
const eqHigh = document.getElementById('eqHigh');
const eqLowValue = document.getElementById('eqLowValue');
const eqMidValue = document.getElementById('eqMidValue');
const eqHighValue = document.getElementById('eqHighValue');
const eqPresetSelect = document.getElementById('eqPresetSelect');
const saveEqPresetBtn = document.getElementById('saveEqPresetBtn');
const deleteEqPresetBtn = document.getElementById('deleteEqPresetBtn');
const resetEqBtn = document.getElementById('resetEqBtn');
const spectrumCanvas = document.getElementById('spectrumCanvas');

// ローカルストレージのキー
const STORAGE_KEY = 'qlab-playlist-data';
const EQ_PRESETS_KEY = 'qlab-eq-presets';

// ======================
// 初期化
// ======================

function init() {
  startClock();
  loadPlaylistsFromStorage();
  loadEQPresets();
  setupEventListeners();
  refreshAudioDevices();
  updateStatus('アプリを読み込みました。音源をアップロードしてください。');
}

// ======================
// 時計表示
// ======================

function startClock() {
  function updateClock() {
    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    const ms = now.getMilliseconds().toString().padStart(3, '0').slice(0, 2);
    headerClock.textContent = `${h}:${m}:${s}.${ms}`;
  }
  updateClock();
  setInterval(updateClock, 10); // 10msごとに更新（1/100秒表示）
}

// ======================
// ローカルストレージ
// ======================

function savePlaylistsToStorage() {
  const data = {};
  Object.keys(state.playlists).forEach(playlistId => {
    const playlist = state.playlists[playlistId];
    data[playlistId] = {
      name: playlist.name,
      items: playlist.items.map(item => ({
        id: item.id,
        name: item.name,
        volume: item.volume || 1,
        loop: item.loop || false,
        startTime: item.startTime || 0,
      })),
    };
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadPlaylistsFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    // 初期プレイリストを作成
    const defaultId = generateId();
    state.playlists[defaultId] = {
      name: 'メイン',
      items: [],
    };
    state.currentPlaylistId = defaultId;
    savePlaylistsToStorage();
    renderPlaylistSelector();
    renderPlaylist();
    return;
  }

  try {
    const data = JSON.parse(raw);
    state.playlists = data;
    const firstId = Object.keys(data)[0];
    state.currentPlaylistId = firstId;
  } catch (e) {
    console.error('プレイリストの読み込みに失敗しました', e);
  }

  renderPlaylistSelector();
  renderPlaylist();
}

// ======================
// EQプリセット
// ======================

function saveEQPresets() {
  localStorage.setItem(EQ_PRESETS_KEY, JSON.stringify(state.eqPresets));
}

function loadEQPresets() {
  const raw = localStorage.getItem(EQ_PRESETS_KEY);
  if (!raw) return;
  try {
    state.eqPresets = JSON.parse(raw);
    renderEQPresetSelector();
  } catch (e) {
    console.error('EQプリセットの読み込みに失敗しました', e);
  }
}

function renderEQPresetSelector() {
  eqPresetSelect.innerHTML = '<option value="">プリセットを選択</option>';
  Object.keys(state.eqPresets).forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    eqPresetSelect.appendChild(option);
  });
}

function handleSaveEQPreset() {
  const name = prompt('プリセット名を入力してください');
  if (!name) return;

  state.eqPresets[name] = { ...state.eq };
  saveEQPresets();
  renderEQPresetSelector();
  updateStatus(`EQプリセット「${name}」を保存しました。`);
}

function handleDeleteEQPreset() {
  const name = eqPresetSelect.value;
  if (!name) {
    alert('削除するプリセットを選択してください');
    return;
  }

  if (!confirm(`EQプリセット「${name}」を削除しますか？`)) return;

  delete state.eqPresets[name];
  saveEQPresets();
  renderEQPresetSelector();
  updateStatus(`EQプリセット「${name}」を削除しました。`);
}

function handleEQPresetChange() {
  const name = eqPresetSelect.value;
  if (!name) return;

  const preset = state.eqPresets[name];
  if (!preset) return;

  state.eq.low = preset.low;
  state.eq.mid = preset.mid;
  state.eq.high = preset.high;

  eqLow.value = state.eq.low;
  eqMid.value = state.eq.mid;
  eqHigh.value = state.eq.high;
  eqLowValue.textContent = `${state.eq.low} dB`;
  eqMidValue.textContent = `${state.eq.mid} dB`;
  eqHighValue.textContent = `${state.eq.high} dB`;

  updateEQ();
  updateStatus(`EQプリセット「${name}」を読み込みました。`);
}

function handleResetEQ() {
  state.eq.low = 0;
  state.eq.mid = 0;
  state.eq.high = 0;

  eqLow.value = state.eq.low;
  eqMid.value = state.eq.mid;
  eqHigh.value = state.eq.high;
  eqLowValue.textContent = `${state.eq.low} dB`;
  eqMidValue.textContent = `${state.eq.mid} dB`;
  eqHighValue.textContent = `${state.eq.high} dB`;

  updateEQ();
  updateStatus('EQをリセットしました。');
}

// ======================
// プレイリスト選択・管理
// ======================

function renderPlaylistSelector() {
  playlistSelect.innerHTML = '';
  Object.keys(state.playlists).forEach(playlistId => {
    const playlist = state.playlists[playlistId];
    const option = document.createElement('option');
    option.value = playlistId;
    option.textContent = playlist.name;
    if (playlistId === state.currentPlaylistId) option.selected = true;
    playlistSelect.appendChild(option);
  });
}

function handlePlaylistChange() {
  state.currentPlaylistId = playlistSelect.value;
  renderPlaylist();
  updateStatus(`プレイリストを「${playlistSelect.selectedOptions[0]?.textContent}」に切り替えました。`);
}

function handleNewPlaylist() {
  const name = prompt('新しいプレイリスト名を入力してください', `プレイリスト ${Object.keys(state.playlists).length + 1}`);
  if (!name) return;

  const id = generateId();
  state.playlists[id] = {
    name,
    items: [],
  };
  state.currentPlaylistId = id;
  savePlaylistsToStorage();
  renderPlaylistSelector();
  renderPlaylist();
  updateStatus(`新しいプレイリスト「${name}」を作成しました。`);
}

function handleRenamePlaylist() {
  const playlist = getCurrentPlaylist();
  if (!playlist) return;

  const newName = prompt('新しい名前を入力してください', playlist.name);
  if (!newName) return;

  playlist.name = newName;
  savePlaylistsToStorage();
  renderPlaylistSelector();
  updateStatus(`プレイリスト名を「${newName}」に変更しました。`);
}

function handleDeletePlaylist() {
  const playlist = getCurrentPlaylist();
  if (!playlist) return;

  if (Object.keys(state.playlists).length <= 1) {
    alert('少なくとも1つのプレイリストが必要です。');
    return;
  }

  if (!confirm(`プレイリスト「${playlist.name}」を削除しますか？`)) return;

  delete state.playlists[state.currentPlaylistId];
  const firstId = Object.keys(state.playlists)[0];
  state.currentPlaylistId = firstId;
  savePlaylistsToStorage();
  renderPlaylistSelector();
  renderPlaylist();
  updateStatus('プレイリストを削除しました。');
}

function getCurrentPlaylist() {
  return state.playlists[state.currentPlaylistId];
}

// ======================
// ファイルアップロード
// ======================

async function handleUpload() {
  const files = fileInput.files;
  if (!files.length) {
    alert('ファイルを選択してください');
    return;
  }

  const playlist = getCurrentPlaylist();
  if (!playlist) return;

  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  updateStatus('ファイルを読み込み中...');

  for (let file of files) {
    if (!file.type.startsWith('audio/')) {
      console.warn(`音声ファイルではありません: ${file.name}`);
      continue;
    }

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);

    const item = {
      id: generateId(),
      name: file.name,
      audioBuffer,
      isSelected: true,
      volume: 1,
      loop: false,
      startTime: 0,
    };

    playlist.items.push(item);
  }

  savePlaylistsToStorage();
  renderPlaylist();
  updateStatus(`${files.length}個のファイルを追加しました。`);
  fileInput.value = '';
}

// ======================
// プレイリスト表示 & ドラッグ＆ドロップ
// ======================

function renderPlaylist() {
  playlistEl.innerHTML = '';
  const playlist = getCurrentPlaylist();
  if (!playlist || playlist.items.length === 0) {
    playlistEl.innerHTML = '<p>プレイリストに音源がありません。</p>';
    return;
  }

  playlist.items.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = `playlist-item ${item.isSelected ? 'selected' : ''} ${index === state.currentPlayIndex ? 'playing' : ''}`;
    div.setAttribute('data-index', index);
    div.draggable = true;

    div.innerHTML = `
      <div class="drag-handle"><i class="fas fa-grip-vertical"></i></div>
      <div class="name">${item.name}</div>
      <div class="controls">
        <input type="range" class="volume-slider" min="0" max="2" step="0.01" value="${item.volume}">
        <div class="volume-value">${Math.round(item.volume * 100)}%</div>
        <input type="number" class="start-time-input" min="0" step="0.1" value="${item.startTime}" placeholder="開始秒数">
        <label><input type="checkbox" class="loop-checkbox" ${item.loop ? 'checked' : ''}> ループ</label>
        <button class="play-from-here-btn" data-index="${index}"><i class="fas fa-play"></i> ここから再生</button>
        <button class="delete-btn danger" data-id="${item.id}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    playlistEl.appendChild(div);

    // 音量スライダー（再生中でも変更可能）
    const slider = div.querySelector('.volume-slider');
    const valueDisplay = div.querySelector('.volume-value');
    slider.addEventListener('input', e => {
      const newVolume = parseFloat(e.target.value);
      item.volume = newVolume;
      valueDisplay.textContent = `${Math.round(newVolume * 100)}%`;
      savePlaylistsToStorage();

      // 再生中なら即時反映
      const nodeInfo = state.audioNodes.get(item.id);
      if (nodeInfo) {
        nodeInfo.gainNode.gain.setValueAtTime(newVolume, state.audioContext.currentTime);
      }
    });

    // 開始秒数入力
    const startTimeInput = div.querySelector('.start-time-input');
    startTimeInput.addEventListener('change', e => {
      const newStartTime = Math.max(0, parseFloat(e.target.value) || 0);
      item.startTime = newStartTime;
      savePlaylistsToStorage();
    });

    // ループチェックボックス
    const loopCb = div.querySelector('.loop-checkbox');
    loopCb.addEventListener('change', e => {
      item.loop = e.target.checked;
      savePlaylistsToStorage();
    });

    // ここから再生ボタン
    div.querySelector('.play-from-here-btn').addEventListener('click', e => {
      const index = parseInt(e.target.dataset.index);
      playFromIndex(index);
    });

    // 削除ボタン
    div.querySelector('.delete-btn').addEventListener('click', e => {
      deleteItem(item.id);
    });

    // ドラッグ＆ドロップ
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
  });
}

function handleDragStart(e) {
  state.dragSourceIndex = parseInt(e.target.closest('.playlist-item').dataset.index);
  e.target.closest('.playlist-item').classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const item = e.target.closest('.playlist-item');
  if (item) item.classList.add('dragging');
}

function handleDragLeave(e) {
  const item = e.target.closest('.playlist-item');
  if (item) item.classList.remove('dragging');
}

function handleDrop(e) {
  e.preventDefault();
  const playlist = getCurrentPlaylist();
  const targetIndex = parseInt(e.target.closest('.playlist-item').dataset.index);
  if (state.dragSourceIndex === targetIndex) return;

  const item = playlist.items.splice(state.dragSourceIndex, 1)[0];
  playlist.items.splice(targetIndex, 0, item);

  savePlaylistsToStorage();
  renderPlaylist();
  updateStatus('プレイリストの順番を変更しました。');
}

function handleDragEnd(e) {
  e.target.closest('.playlist-item').classList.remove('dragging');
}

function deleteItem(id) {
  const playlist = getCurrentPlaylist();
  playlist.items = playlist.items.filter(item => item.id != id);
  savePlaylistsToStorage();
  renderPlaylist();
  updateStatus('項目を削除しました。');
}

// ======================
// 再生機能（順次再生・一時停止・ループ・途中再生・指定秒数から再生）
// ======================

async function playSelected() {
  if (state.isPlaying) {
    updateStatus('すでに再生中です。');
    return;
  }

  const playlist = getCurrentPlaylist();
  const selectedItems = playlist.items.filter(item => item.isSelected);
  if (selectedItems.length === 0) {
    updateStatus('再生する音源が選択されていません。');
    return;
  }

  playFromIndex(0, selectedItems);
}

function playFromIndex(startIndex, items = null) {
  if (!items) {
    const playlist = getCurrentPlaylist();
    items = playlist.items.filter(item => item.isSelected);
  }

  if (items.length === 0) {
    updateStatus('再生する音源が選択されていません。');
    return;
  }

  if (!state.audioContext) {
    state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (state.audioContext.state === 'suspended') {
    state.audioContext.resume();
  }

  stopAll(); // 既存の再生を停止

  state.currentPlayIndex = startIndex;
  state.playStartTime = state.audioContext.currentTime - state.pauseOffset;
  state.isPaused = false;
  state.pauseOffset = 0;
  state.isPlaying = true;

  updateStatus(`選択された${items.length}個の音源を${startIndex + 1}曲目から再生します。`);
  startPlaybackLoop(items);
}

function startPlaybackLoop(items) {
  if (state.isPaused || !state.isPlaying) return;

  if (state.currentPlayIndex >= items.length) {
    if (state.loopAll) {
      // 全体ループ
      state.currentPlayIndex = 0;
      state.playStartTime = state.audioContext.currentTime;
      state.pauseOffset = 0;
    } else {
      // 全て再生完了
      updateStatus('すべての音源の再生が完了しました。');
      clearInterval(state.playInterval);
      state.playInterval = null;
      state.currentPlayIndex = -1;
      state.isPlaying = false;
      renderPlaylist();
      updateNowPlaying();
      updateHeaderStatus();
      return;
    }
  }

  const item = items[state.currentPlayIndex];
  playItem(item, state.currentPlayIndex);

  // 次の曲までの時間を計算して表示
  const duration = item.audioBuffer.duration;
  const nextStart = state.playStartTime + items.slice(0, state.currentPlayIndex + 1)
    .reduce((sum, it) => sum + it.audioBuffer.duration, 0);

  updateNextInfo(duration, nextStart - state.audioContext.currentTime);

  // この曲が終了したら次の曲へ（ループ設定に応じて）
  const timeoutId = setTimeout(() => {
    if (!state.isPlaying) return;

    if (state.loopOne && item.loop) {
      // 個別ループが有効でこの曲がループ設定なら再再生
      playItem(item, state.currentPlayIndex);
      setTimeout(() => {
        if (!state.isPlaying) return;
        state.currentPlayIndex++;
        startPlaybackLoop(items);
      }, duration * 1000);
    } else {
      state.currentPlayIndex++;
      startPlaybackLoop(items);
    }
  }, duration * 1000);

  // 一時停止時にクリアするためにIDを保持（簡略化のため state に保持していませんが、必要なら追加可）
}

function playItem(item, index) {
  if (!item.audioBuffer) return;

  const source = state.audioContext.createBufferSource();
  const gainNode = state.audioContext.createGain();
  const analyser = state.audioContext.createAnalyser();

  // EQ用のBiquadFilter（簡易3バンド）
  const lowFilter = state.audioContext.createBiquadFilter();
  const midFilter = state.audioContext.createBiquadFilter();
  const highFilter = state.audioContext.createBiquadFilter();

  lowFilter.type = 'lowshelf';
  lowFilter.frequency.value = 320;
  lowFilter.gain.value = state.eq.low;

  midFilter.type = 'peaking';
  midFilter.frequency.value = 1000;
  midFilter.Q.value = 1;
  midFilter.gain.value = state.eq.mid;

  highFilter.type = 'highshelf';
  highFilter.frequency.value = 3200;
  highFilter.gain.value = state.eq.high;

  source.buffer = item.audioBuffer;
  gainNode.gain.value = item.volume;
  analyser.fftSize = 256;

  // 接続: source -> low -> mid -> high -> gain -> analyser -> destination
  source.connect(lowFilter);
  lowFilter.connect(midFilter);
  midFilter.connect(highFilter);
  highFilter.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(state.audioContext.destination);

  const startTime = state.audioContext.currentTime;
  const startOffset = Math.max(0, Math.min(item.startTime, item.audioBuffer.duration));
  source.start(startTime, startOffset);

  const nodeInfo = {
    sourceNode: source,
    gainNode: gainNode,
    analyserNode: analyser,
    biquadFilters: { low: lowFilter, mid: midFilter, high: highFilter },
    startTime: startTime,
    duration: item.audioBuffer.duration,
  };
  state.audioNodes.set(item.id, nodeInfo);

  source.onended = () => {
    state.audioNodes.delete(item.id);
  };

  // 進捗更新用インターバル
  if (state.playInterval) clearInterval(state.playInterval);
  state.playInterval = setInterval(() => {
    updateProgress();
    updateNowPlaying();
  }, 10); // 10msごとに更新（1/100秒表示）

  // 音量メーター開始
  startMeter();
  // スペクトラムアナライザー開始
  startSpectrum();

  renderPlaylist();
  updateNowPlaying();
  updateHeaderStatus();
}

function pausePlayback() {
  if (!state.audioContext || state.isPaused || !state.isPlaying) return;

  state.isPaused = true;
  const currentTime = state.audioContext.currentTime;
  const elapsed = currentTime - state.playStartTime;
  state.pauseOffset = elapsed; // 経過時間を正確に保持

  state.audioNodes.forEach((nodeInfo, id) => {
    nodeInfo.sourceNode.stop();
  });
  state.audioNodes.clear();
  clearInterval(state.playInterval);
  state.playInterval = null;
  stopMeter();
  stopSpectrum();

  updateStatus('再生を一時停止しました。');
  updateHeaderStatus();
}

function resumePlayback() {
  if (!state.audioContext || !state.isPaused || !state.isPlaying) return;

  const playlist = getCurrentPlaylist();
  const selectedItems = playlist.items.filter(item => item.isSelected);
  if (selectedItems.length === 0) return;

  state.isPaused = false;
  // playStartTime は playFromIndex 内で pauseOffset を考慮して再設定される
  startPlaybackLoop(selectedItems);
  updateStatus('再生を再開しました。');
  updateHeaderStatus();
}

function stopAll() {
  const fadeTime = 1.0; // 1秒フェードアウト
  const now = state.audioContext ? state.audioContext.currentTime : 0;

  state.audioNodes.forEach((nodeInfo, id) => {
    const { sourceNode, gainNode } = nodeInfo;
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0, now + fadeTime);
    setTimeout(() => {
      try {
        sourceNode.stop();
      } catch (e) {
        // すでに停止している場合など
      }
    }, fadeTime * 1000);
  });

  state.audioNodes.clear();
  clearInterval(state.playInterval);
  state.playInterval = null;
  state.currentPlayIndex = -1;
  state.isPaused = false;
  state.pauseOffset = 0;
  state.isPlaying = false;
  stopMeter();
  stopSpectrum();
  updateProgress();
  updateNowPlaying();
  updateHeaderStatus();
  renderPlaylist();
  updateStatus('すべての再生をフェードアウトして停止しました。');
}

// ======================
// 進捗表示（1/100秒精度・リアルタイム更新）
// ======================

function updateProgress() {
  if (state.currentPlayIndex < 0 || !state.audioContext || state.isPaused || !state.isPlaying) {
    progressFill.style.width = '0%';
    progressText.textContent = '-';
    nextInfo.textContent = '-';
    return;
  }

  const playlist = getCurrentPlaylist();
  const selectedItems = playlist.items.filter(item => item.isSelected);
  const totalDuration = selectedItems.reduce((sum, item) => sum + item.audioBuffer.duration, 0);

  const currentTime = state.audioContext.currentTime;
  const elapsed = currentTime - state.playStartTime;

  const progressPercent = totalDuration > 0 ? Math.min(100, (elapsed / totalDuration) * 100) : 0;
  progressFill.style.width = `${progressPercent}%`;

  const currentItem = selectedItems[state.currentPlayIndex];
  if (currentItem) {
    const itemElapsed = elapsed - selectedItems.slice(0, state.currentPlayIndex)
      .reduce((sum, item) => sum + item.audioBuffer.duration, 0);
    const itemRemaining = Math.max(0, currentItem.audioBuffer.duration - itemElapsed);
    progressText.textContent = `現在 ${state.currentPlayIndex + 1}/${selectedItems.length}曲目 - 残り ${formatTimeHundredths(itemRemaining)}`;
  } else {
    progressText.textContent = '-';
  }
}

function updateNextInfo(currentDuration, timeUntilNext) {
  if (timeUntilNext <= 0) {
    nextInfo.textContent = '次の曲はありません';
  } else {
    nextInfo.textContent = `次の曲まで約 ${formatTimeHundredths(timeUntilNext)}`;
  }
}

function formatTimeHundredths(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const hundredths = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

// ======================
// 現在再生中表示（上部固定エリア）
// ======================

function updateNowPlaying() {
  if (state.currentPlayIndex < 0 || !state.audioContext || state.isPaused || !state.isPlaying) {
    nowPlayingTitle.textContent = '再生中の曲はありません';
    nowPlayingProgressFill.style.width = '0%';
    return;
  }

  const playlist = getCurrentPlaylist();
  const selectedItems = playlist.items.filter(item => item.isSelected);
  const currentItem = selectedItems[state.currentPlayIndex];
  if (!currentItem) {
    nowPlayingTitle.textContent = '再生中の曲はありません';
    nowPlayingProgressFill.style.width = '0%';
    return;
  }

  const currentTime = state.audioContext.currentTime;
  const elapsed = currentTime - state.playStartTime;
  const itemElapsed = elapsed - selectedItems.slice(0, state.currentPlayIndex)
    .reduce((sum, item) => sum + item.audioBuffer.duration, 0);
  const itemProgressPercent = currentItem.audioBuffer.duration > 0
    ? Math.min(100, (itemElapsed / currentItem.audioBuffer.duration) * 100)
    : 0;

  nowPlayingTitle.textContent = currentItem.name;
  nowPlayingProgressFill.style.width = `${itemProgressPercent}%`;
}

// ======================
// ヘッダー状態表示
// ======================

function updateHeaderStatus() {
  if (!state.isPlaying) {
    headerStatus.textContent = '停止中';
    headerStatus.className = 'header-status';
  } else if (state.isPaused) {
    headerStatus.textContent = '一時停止中';
    headerStatus.className = 'header-status paused';
  } else {
    headerStatus.textContent = '再生中';
    headerStatus.className = 'header-status playing';
  }
}

// ======================
// 音量メーター（ピークメーター風・+12dBスケール）
// ======================

function startMeter() {
  if (state.meterInterval) clearInterval(state.meterInterval);
  state.meterPeak = -60;
  state.meterLastUpdate = Date.now();

  state.meterInterval = setInterval(() => {
    let maxVolume = 0;
    state.audioNodes.forEach(nodeInfo => {
      const analyser = nodeInfo.analyserNode;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      const volume = Math.max(...dataArray) / 255;
      if (volume > maxVolume) maxVolume = volume;
    });

    // 音量をdBに変換（+12dBを最大とする）
    const dB = volumeToDB(maxVolume);
    const normalizedDB = Math.min(12, Math.max(-30, dB)); // -30〜+12dBにクリップ

    // ピークホールド更新
    if (normalizedDB > state.meterPeak) {
      state.meterPeak = normalizedDB;
      state.meterLastUpdate = Date.now();
    } else {
      // 1秒経過したら0.5dBずつ減衰
      const now = Date.now();
      if (now - state.meterLastUpdate > 1000) {
        state.meterPeak = Math.max(-60, state.meterPeak - 0.5);
        state.meterLastUpdate = now;
      }
    }

    const peakPercent = ((state.meterPeak + 60) / 72) * 100; // -60dB=0%, +12dB=100%
    meterFill.style.width = `${peakPercent}%`;
    meterLabel.textContent = `${state.meterPeak.toFixed(1)} dB`;
  }, 50);
}

function stopMeter() {
  if (state.meterInterval) clearInterval(state.meterInterval);
  state.meterInterval = null;
  meterFill.style.width = '0%';
  meterLabel.textContent = '- dB';
}

function volumeToDB(volume) {
  if (volume <= 0) return -Infinity;
  return 20 * Math.log10(volume);
}

// ======================
// スペクトラムアナライザー
// ======================

function startSpectrum() {
  if (state.spectrumInterval) clearInterval(state.spectrumInterval);
  const ctx = spectrumCanvas.getContext('2d');
  const width = spectrumCanvas.width;
  const height = spectrumCanvas.height;

  state.spectrumInterval = setInterval(() => {
    ctx.clearRect(0, 0, width, height);

    let maxVolume = 0;
    state.audioNodes.forEach(nodeInfo => {
      const analyser = nodeInfo.analyserNode;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);

      const barWidth = width / dataArray.length;
      for (let i = 0; i < dataArray.length; i++) {
        const value = dataArray[i] / 255;
        const barHeight = value * height;
        ctx.fillStyle = `hsl(${i / dataArray.length * 240}, 100%, 50%)`;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
      }

      const volume = Math.max(...dataArray) / 255;
      if (volume > maxVolume) maxVolume = volume;
    });
  }, 50);
}

function stopSpectrum() {
  if (state.spectrumInterval) clearInterval(state.spectrumInterval);
  state.spectrumInterval = null;
  const ctx = spectrumCanvas.getContext('2d');
  ctx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
}

// ======================
// EQ設定（水平スライダー・プリセット対応）
// ======================

function setupEQControls() {
  eqLow.addEventListener('input', e => {
    const value = parseFloat(e.target.value);
    state.eq.low = value;
    eqLowValue.textContent = `${value} dB`;
    updateEQ();
  });

  eqMid.addEventListener('input', e => {
    const value = parseFloat(e.target.value);
    state.eq.mid = value;
    eqMidValue.textContent = `${value} dB`;
    updateEQ();
  });

  eqHigh.addEventListener('input', e => {
    const value = parseFloat(e.target.value);
    state.eq.high = value;
    eqHighValue.textContent = `${value} dB`;
    updateEQ();
  });
}

function updateEQ() {
  state.audioNodes.forEach(nodeInfo => {
    const { biquadFilters } = nodeInfo;
    biquadFilters.low.gain.value = state.eq.low;
    biquadFilters.mid.gain.value = state.eq.mid;
    biquadFilters.high.gain.value = state.eq.high;
  });
}

// ======================
// デバイス選択
// ======================

async function refreshAudioDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
    updateStatus('このブラウザではオーディオデバイスの列挙がサポートされていません。');
    return;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

    deviceSelect.innerHTML = '<option value="">デフォルトデバイス</option>';
    audioOutputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `デバイス ${device.deviceId}`;
      deviceSelect.appendChild(option);
    });
  } catch (e) {
    console.error('デバイス列挙に失敗しました', e);
  }
}

function handleDeviceChange() {
  const deviceId = deviceSelect.value;
  state.outputDevice = deviceId || null;
  updateStatus(`出力デバイスを変更しました: ${deviceSelect.selectedOptions[0]?.textContent || 'デフォルト'}`);
}

// ======================
// キーボードショートカット
// ======================

function handleKeydown(e) {
  if (e.code === 'Space') {
    e.preventDefault();
    if (state.isPaused) {
      resumePlayback();
    } else {
      playSelected();
    }
  } else if (e.code === 'Escape') {
    e.preventDefault();
    stopAll();
  }
}

// ======================
// イベントリスナー設定
// ======================

function setupEventListeners() {
  uploadBtn.addEventListener('click', handleUpload);
  refreshDevicesBtn.addEventListener('click', refreshAudioDevices);
  playlistSelect.addEventListener('change', handlePlaylistChange);
  newPlaylistBtn.addEventListener('click', handleNewPlaylist);
  renamePlaylistBtn.addEventListener('click', handleRenamePlaylist);
  deletePlaylistBtn.addEventListener('click', handleDeletePlaylist);
  deviceSelect.addEventListener('change', handleDeviceChange);
  playSelectedBtn.addEventListener('click', playSelected);
  pauseBtn.addEventListener('click', pausePlayback);
  resumeBtn.addEventListener('click', resumePlayback);
  stopAllBtn.addEventListener('click', stopAll);
  loopAllCheckbox.addEventListener('change', e => {
    state.loopAll = e.target.checked;
  });
  loopOneCheckbox.addEventListener('change', e => {
    state.loopOne = e.target.checked;
  });
  eqPresetSelect.addEventListener('change', handleEQPresetChange);
  saveEqPresetBtn.addEventListener('click', handleSaveEQPreset);
  deleteEqPresetBtn.addEventListener('click', handleDeleteEQPreset);
  resetEqBtn.addEventListener('click', handleResetEQ);
  document.addEventListener('keydown', handleKeydown);
  setupEQControls();
}

// ======================
// ユーティリティ
// ======================

function updateStatus(message) {
  statusEl.textContent = message;
}

function generateId() {
  return Date.now() + Math.random().toString(36).slice(2);
}

// 初期化実行
init();
