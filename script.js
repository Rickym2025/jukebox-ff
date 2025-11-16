document.addEventListener('DOMContentLoaded', function() {
    // =============================================================
    // --- 1. CONFIGURAZIONE E VARIABILI ---
    // =============================================================
    const sheetApiUrl = 'https://script.google.com/macros/s/AKfycbw666DGD4BlSHuJwmVYcRLF9_qMJX2LXy_r6gCGVbjR_dXQDngQU-JttofSKOwUkIJZ/exec';
    const STRIPE_PUBLISHABLE_KEY = "pk_test_51S0GLJLyZ8FXl87PPrgWhBO9RP4ERXMcwT3KQ65JVOYRwYXFsBSohEM7tZE1yDFPusNPcqHK3Ivk8FSNYyj7TdkK00Jeb1SEET";
    const ADDON_PRICE_IDS = { siae: "price_1S5NN8LyZ8FXl87PRrpQOXDm", video: "price_1S5QcrLyZ8FXl87PipiY314W" };
    const ADDON_PRICES = { siae: 100, video: 49 };
    const MAX_PLAYS = 3;
    const RESET_PASSWORD = 'reset_ff_2025';

    let allSongs = [], shoppingCart = [], currentPlayingItem = null, currentPlayingType = null, currentUserEmail = '';

    const songListContainer = document.getElementById('song-list-container');
    const audioPlayer = document.getElementById('jukebox-audio-player');
    const videoPlayer = document.getElementById('jukebox-video-player');
    const footerPlayer = document.getElementById('footer-player');
    const footerPlayerTitle = document.getElementById('footer-player-title');
    const cartBanner = document.getElementById('cart-banner');
    const cartItemsList = document.getElementById('cart-items-list');
    const cartTotalEl = document.getElementById('cart-total');
    const allModalOverlays = document.querySelectorAll('.modal-overlay');

    // =============================================================
    // --- 2. LOGICA CARRELLO E CHECKOUT (NUOVA) ---
    // =============================================================
    function openAddToCartModal(songData) {
        const modal = document.getElementById('add-to-cart-modal');
        const modalContent = document.getElementById('add-to-cart-modal-content');
        const basePrice = parseFloat(songData.prezzo);
        modalContent.innerHTML = `<h3>Aggiungi Opzioni per</h3><p class="song-title-highlight">${songData.titolo}</p><div class="upsell-options"><div class="upsell-item" data-price="${ADDON_PRICES.siae}" data-id="add-siae"><i class="fas fa-check-circle check-icon"></i><div class="upsell-item-details"><strong>Aggiungi Gestione Diritti SIAE</strong><span>Include il deposito dell'opera e la gestione burocratica (+${ADDON_PRICES.siae.toFixed(2)}€).</span></div></div>${(songData.videolink && songData.videolink.trim() !== '' && songData.videolink.toUpperCase() !== 'FALSE') ? `<div class="upsell-item" data-price="${ADDON_PRICES.video}" data-id="add-video"><i class="fas fa-check-circle check-icon"></i><div class="upsell-item-details"><strong>Aggiungi Video Promozionale</strong><span>Un video ottimizzato per i tuoi canali social (+${ADDON_PRICES.video.toFixed(2)}€).</span></div></div>` : ''}</div><div class="info-box"><strong>Nota Fiscale:</strong> La cessione di opere dell'ingegno è esente da IVA. Il prezzo indicato è l'imponibile su cui, se sei un soggetto con Partita IVA, dovrai versare la ritenuta d'acconto del 20%.</div><div id="purchase-summary"><button id="confirm-add-to-cart-btn" class="add-to-cart-btn">Conferma e Aggiungi</button></div>`;
        modal.style.display = 'flex';
        modalContent.querySelectorAll('.upsell-item').forEach(item => item.addEventListener('click', () => item.classList.toggle('selected')));
        document.getElementById('confirm-add-to-cart-btn').onclick = () => {
            const songToAdd = { id: songData.id, title: songData.titolo, price: basePrice, withSIAE: modalContent.querySelector('[data-id="add-siae"]').classList.contains('selected'), withVideo: modalContent.querySelector('[data-id="add-video"]')?.classList.contains('selected') || false };
            addToCart(songToAdd);
            closeAllModals();
        };
    }
    function addToCart(songToAdd) {
        const existingIndex = shoppingCart.findIndex(item => item.id === songToAdd.id);
        if (existingIndex > -1) shoppingCart[existingIndex] = songToAdd; else shoppingCart.push(songToAdd);
        renderCart();
        updateSongItemsUI();
    }
    function removeFromCart(songId) {
        shoppingCart = shoppingCart.filter(item => item.id.toString() !== songId.toString());
        renderCart();
        updateSongItemsUI();
    }
    function renderCart() {
        if (shoppingCart.length === 0) { cartBanner.classList.remove('visible'); return; }
        cartItemsList.innerHTML = '';
        let total = 0;
        shoppingCart.forEach(item => {
            let itemTotal = item.price;
            let optionsText = [];
            if (item.withSIAE) { itemTotal += ADDON_PRICES.siae; optionsText.push('SIAE'); }
            if (item.withVideo) { itemTotal += ADDON_PRICES.video; optionsText.push('Video'); }
            total += itemTotal;
            cartItemsList.innerHTML += `<div class="cart-item"><div class="cart-item-details"><span class="title">${item.title}</span>${optionsText.length > 0 ? `<span class="options">+ ${optionsText.join(' & ')}</span>` : ''}</div><div class="cart-item-price">${itemTotal.toFixed(2)}€</div><button class="cart-item-remove" data-id="${item.id}">&times;</button></div>`;
        });
        cartTotalEl.textContent = `Totale: ${total.toFixed(2)}€`;
        cartBanner.classList.add('visible');
    }
    function updateSongItemsUI() {
        document.querySelectorAll('.song-item').forEach(item => {
            const btn = item.querySelector('.add-to-cart-btn');
            if (btn) {
                const songId = item.dataset.id;
                const isInCart = shoppingCart.some(cartItem => cartItem.id.toString() === songId);
                if (isInCart) {
                    item.classList.add('in-cart');
                    btn.innerHTML = '<i class="fas fa-edit"></i> Modifica Opzioni';
                } else {
                    item.classList.remove('in-cart');
                    btn.innerHTML = `Aggiungi al carrello da ${parseFloat(item.dataset.prezzo).toFixed(2)}€`;
                }
            }
        });
    }
    function redirectToCheckout() {
        if (shoppingCart.length === 0) return;
        if (!STRIPE_PUBLISHABLE_KEY) { alert("Errore: Chiave Stripe non configurata."); return; }
        const lineItemsPayload = [];
        shoppingCart.forEach(item => {
            const unitAmount = Math.round(parseFloat(item.price) * 100);
            if (isNaN(unitAmount) || unitAmount <= 0) { alert(`Errore: Prezzo non valido per il brano "${item.title}".`); return; }
            lineItemsPayload.push({ price_data: { currency: 'eur', product_data: { name: `Brano: ${item.title}` }, unit_amount: unitAmount }, quantity: 1 });
            if (item.withSIAE) lineItemsPayload.push({ price: ADDON_PRICE_IDS.siae, quantity: 1 });
            if (item.withVideo) lineItemsPayload.push({ price: ADDON_PRICE_IDS.video, quantity: 1 });
        });
        const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
        stripe.redirectToCheckout({
            lineItems: lineItemsPayload,
            mode: 'payment',
            allow_promotion_codes: true,
            successUrl: `${window.location.origin}${window.location.pathname}?payment=success`,
            cancelUrl: `${window.location.origin}${window.location.pathname}?payment=cancel`,
        }).catch(error => { console.error("ERRORE DA STRIPE:", error); alert("Si è verificato un errore con Stripe."); });
    }
    
    // =============================================================
    // --- 3. RENDER (DAL TUO CODICE ORIGINALE) ---
    // =============================================================
    function renderSongs(songsToRender) {
        songListContainer.innerHTML = '';
        if (songsToRender.length === 0) {
            songListContainer.innerHTML = '<p>Nessun brano corrisponde ai filtri selezionati.</p>';
            return;
        }
        songsToRender.forEach(song => {
            const count = getPlayCounts()[song.id] || 0;
            const playsLeft = MAX_PLAYS - count;
            const isLocked = playsLeft <= 0;
            let purchaseHTML = '';
            if (song.prezzo && String(song.prezzo).trim() !== '' && song.stato?.toLowerCase() !== 'venduto') {
                purchaseHTML = `<button class="add-to-cart-btn">Aggiungi al carrello da ${parseFloat(song.prezzo).toFixed(2)}€</button>`;
            } else if (song.stato?.toLowerCase() === 'venduto') {
                purchaseHTML = `<p style="color: #f44336; font-weight: bold; grid-column: 1 / -1;">Brano Venduto</p>`;
            }
            const hasLyrics = song.liriche && song.liriche.trim() !== "";
            const hasVideo = song.video_link && String(song.video_link).trim() !== '' && String(song.video_link).toUpperCase() !== 'FALSE';
            const songItem = document.createElement('div');
            songItem.className = 'song-item';
            Object.keys(song).forEach(key => {
                const camelCaseKey = key.toLowerCase().replace(/_([a-z])/g, g => g[1].toUpperCase());
                songItem.dataset[camelCaseKey] = song[key];
            });
            songItem.innerHTML = `<div class="song-item-top"><div class="song-info"><span class="title">${song.titolo}</span><div class="plays-left">${isLocked ? 'Limite ascolti raggiunto' : `Ascolti rimasti: ${playsLeft}`}</div><div class="song-details">${song.bpm ? `<span><i class="fas fa-tachometer-alt"></i> ${song.bpm} BPM</span>` : ''}${song.durata ? `<span><i class="far fa-clock"></i> ${song.durata}</span>` : ''}</div></div><button class="btn info-btn top-row" title="Cosa include l'acquisto?"><i class="fas fa-info-circle"></i></button></div><div class="song-actions"><button class="btn action-btn audio ${isLocked ? 'disabled' : ''}" title="${isLocked ? 'Limite ascolti' : 'Ascolta'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-headphones'}"></i> Audio</button>${hasVideo ? `<button class="btn action-btn video ${isLocked ? 'disabled' : ''}" title="${isLocked ? 'Limite ascolti' : 'Guarda Video'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-film'}"></i> Video</button>` : '<div></div>'}${hasLyrics ? `<button class="btn action-btn lyrics" title="Leggi Testo"><i class="fas fa-file-lines"></i> Testo</button>` : '<div></div>'}${purchaseHTML}</div>`;
            songListContainer.appendChild(songItem);
        });
        updateSongItemsUI();
    }
    
    // =============================================================
    // --- 4. SETUP EVENTI (DAL TUO CODICE ORIGINALE, CON INTEGRAZIONI) ---
    // =============================================================
    function setupEventListeners() {
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('contact-form').addEventListener('submit', handleContactForm);
        document.getElementById('cart-checkout-btn').addEventListener('click', redirectToCheckout);
        document.getElementById('show-contact-modal-btn').addEventListener('click', () => document.getElementById('contact-modal').style.display = 'flex');
        cartItemsList.addEventListener('click', (e) => { if (e.target.classList.contains('cart-item-remove')) removeFromCart(e.target.dataset.id); });
        songListContainer.addEventListener('click', function(e) {
            const songItem = e.target.closest('.song-item');
            if (!songItem) return;
            if (e.target.closest('.add-to-cart-btn')) openAddToCartModal(songItem.dataset);
            else if (e.target.closest('.action-btn.audio') || e.target.closest('.title')) handlePlay(songItem, 'audio');
            else if (e.target.closest('.action-btn.video')) handlePlay(songItem, 'video');
            else if (e.target.closest('.action-btn.lyrics')) showLyrics(songItem);
            else if (e.target.closest('.info-btn')) openPurchaseInfoModal();
        });
        allModalOverlays.forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); });
            modal.querySelector('.modal-close')?.addEventListener('click', () => closeAllModals());
        });
        audioPlayer.addEventListener('play', () => currentPlayingItem?.classList.add('playing-audio'));
        videoPlayer.addEventListener('play', () => currentPlayingItem?.classList.add('playing-video'));
        audioPlayer.addEventListener('pause', () => currentPlayingItem?.classList.remove('playing-audio', 'playing-video'));
        videoPlayer.addEventListener('pause', () => currentPlayingItem?.classList.remove('playing-video'));
        audioPlayer.addEventListener('ended', resetPlayingState);
        videoPlayer.addEventListener('ended', closeAllModals);
    }

    // =============================================================
    // --- 5. FUNZIONI CORE (TUTTE DAL TUO CODICE ORIGINALE) ---
    // =============================================================
    async function handleLogin(e) { e.preventDefault(); const email = document.getElementById('email-input').value.trim().toLowerCase(); if (!email) { alert('Per favore, inserisci un\'email.'); return; } currentUserEmail = email; const btn = e.target.querySelector('button'); btn.textContent = 'Verifico...'; btn.disabled = true; try { const res = await fetch(`${sheetApiUrl}?source=jukebox&emailCheck=${encodeURIComponent(email)}`); if (!res.ok) throw new Error(`Network response was not ok`); const result = await res.json(); if (result.status === "ok" && result.name) { document.getElementById('login-screen').style.display = 'none'; document.getElementById('jukebox-container').style.display = 'block'; document.getElementById('client-name').textContent = result.name; await loadMusicFromApi(email); } else { alert(result.message || 'Accesso non autorizzato.'); } } catch (err) { console.error("Login fetch error:", err); alert('Errore di comunicazione.'); } finally { btn.textContent = 'Accedi'; btn.disabled = false; } }
    async function loadMusicFromApi(userEmail) { songListContainer.innerHTML = `<p>Caricamento...</p>`; try { const res = await fetch(`${sheetApiUrl}?source=jukebox&userEmail=${encodeURIComponent(userEmail)}`); if (!res.ok) throw new Error(`Network response was not ok`); const data = await res.json(); if (data && data.songs) { allSongs = data.songs; populateFilters(allSongs); applyFilters(); } else { throw new Error("Formato dati non valido dalla API."); } } catch (err) { console.error("loadMusicFromApi error:", err); songListContainer.innerHTML = `<p style="color: #f44336;">Errore nel caricamento dei brani.</p>`; } }
    function populateFilters(songs) { const filters = { categoria: new Set(), argomento: new Set(), bpm: new Set() }; songs.forEach(s => { if (s.categoria && typeof s.categoria === 'string') s.categoria.split(/[;,]/).forEach(cat => { if (cat.trim()) filters.categoria.add(cat.trim()); }); if (s.argomento && typeof s.argomento === 'string') s.argomento.split(/[;,]/).forEach(arg => { if (arg.trim()) filters.argomento.add(arg.trim()); }); if (s.bpm) filters.bpm.add(s.bpm); }); const createBtns = (type, items, label) => { const cont = document.getElementById(`filter-${type}`); if (!cont) return; cont.innerHTML = ''; const allBtn = document.createElement('button'); allBtn.textContent = label; allBtn.value = ''; allBtn.className = 'active'; cont.appendChild(allBtn); [...items].sort((a, b) => isNaN(a) ? a.localeCompare(b) : a - b).forEach(item => { const btn = document.createElement('button'); btn.textContent = item; btn.value = item; cont.appendChild(btn); }); cont.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { cont.querySelectorAll('button').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); applyFilters(); } }); }; createBtns('categoria', filters.categoria, 'Tutte'); createBtns('argomento', filters.argomento, 'Tutti'); createBtns('bpm', filters.bpm, 'Tutti'); }
    function applyFilters() { const getActive = id => document.querySelector(`#filter-${id} button.active`)?.value ?? ''; const filtered = allSongs.filter(song => { const categoryMatch = !getActive('categoria') || (song.categoria && song.categoria.split(/[;,]/).map(c => c.trim()).includes(getActive('categoria'))); const argumentMatch = !getActive('argomento') || (song.argomento && song.argomento.split(/[;,]/).map(a => a.trim()).includes(getActive('argomento'))); const bpmMatch = !getActive('bpm') || (song.bpm && String(song.bpm) === getActive('bpm')); return categoryMatch && argumentMatch && bpmMatch; }); renderSongs(filtered); }
    function handlePlay(item, type = 'audio') {
        const targetButton = item.querySelector(`.action-btn.${type}`);
        if (targetButton && targetButton.classList.contains('disabled')) { alert("Hai raggiunto il limite di ascolti per questo brano."); return; }
        const isPlayingThisItem = item === currentPlayingItem && type === currentPlayingType;
        if (isPlayingThisItem) { if (type === 'audio') audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause(); else videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause(); return; }
        const counts = getPlayCounts();
        const songId = item.dataset.id;
        let count = counts[songId] || 0;
        resetPlayingState();
        currentPlayingItem = item;
        currentPlayingType = type;
        if (type === 'audio') {
            footerPlayer.classList.add('visible');
            footerPlayerTitle.textContent = item.dataset.titolo;
            audioPlayer.src = item.dataset.linkascolto;
            audioPlayer.play();
        } else if (type === 'video') {
            videoPlayer.src = item.dataset.videolink;
            document.getElementById('video-modal').style.display = 'flex';
            videoPlayer.play();
        }
        count++;
        counts[songId] = count;
        savePlayCounts(counts);
        trackPlay(songId, item.dataset.titolo, currentUserEmail);
        applyFilters();
    }
    function getPlayCounts() { return JSON.parse(localStorage.getItem(`jukeboxPlayCounts_${currentUserEmail}`)) || {}; }
    function savePlayCounts(counts) { localStorage.setItem(`jukeboxPlayCounts_${currentUserEmail}`, JSON.stringify(counts)); }
    async function trackPlay(songId, songTitle, userEmail) { const formData = new FormData(); formData.append('action', 'play'); formData.append('id', songId); formData.append('title', songTitle); formData.append('email', userEmail); try { await fetch(sheetApiUrl, { method: 'POST', body: formData }); } catch (error) { console.error("Impossibile tracciare l'ascolto:", error); } }
    function showLyrics(item) { const modal = document.getElementById('lyrics-modal'); if (modal) { modal.querySelector('#lyrics-title').innerText = item.dataset.titolo; modal.querySelector('#lyrics-text').innerText = item.dataset.liriche || "Testo non disponibile."; modal.style.display = 'flex'; } }
    function openPurchaseInfoModal() { const modal = document.getElementById('purchase-info-modal'); if (modal) modal.style.display = 'flex'; }
    function closeAllModals() { allModalOverlays.forEach(m => { if(m) m.style.display = 'none' }); if (currentPlayingType === 'video') { videoPlayer.pause(); videoPlayer.src = ''; } }
    function resetPlayingState() { if (currentPlayingItem) { currentPlayingItem.classList.remove('playing-audio', 'playing-video'); } currentPlayingItem = null; currentPlayingType = null; if (!audioPlayer.paused) { footerPlayer.classList.remove('visible'); audioPlayer.pause(); } }
    async function handleContactForm(e) { e.preventDefault(); const form = e.target; const formData = new FormData(form); const resultEl = form.querySelector('#form-result'); resultEl.innerHTML = "Invio..."; const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; try { const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: formData }); const result = await res.json(); if (result.success) { resultEl.innerHTML = "<span style='color: var(--success-color);'>Messaggio inviato!</span>"; form.reset(); setTimeout(() => closeAllModals(), 3000); } else { resultEl.innerHTML = `<span style='color: #e53935;'>Errore: ${result.message}</span>`; } } catch (err) { resultEl.innerHTML = "<span style='color: #e53935;'>Errore di rete.</span>"; } finally { btn.disabled = false; } }
    function handleResetFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'reset' && urlParams.get('password') === RESET_PASSWORD) {
            const email = urlParams.get('email');
            if(email) {
                localStorage.removeItem(`jukeboxPlayCounts_${email.toLowerCase()}`);
                alert(`Conteggio per ${email} resettato.`);
                window.history.replaceState({}, document.title, window.location.pathname);
                window.location.reload();
            }
        }
    }
    handleResetFromUrl();
    setupEventListeners();
});
