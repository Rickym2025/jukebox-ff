document.addEventListener('DOMContentLoaded', function() {
    // =============================================================
    // --- 1. CONFIGURAZIONE E VARIABILI GLOBALI ---
    // =============================================================
    const sheetApiUrl = 'https://script.google.com/macros/s/AKfycbw666DGD4BlSHuJwmVYcRLF9_qMJX2LXy_r6gCGVbjR_dXQDngQU-JttofSKOwUkIJZ/exec?source=jukebox';
    const STRIPE_PUBLISHABLE_KEY = "pk_test_51S0GLJLyZ8FXl87PPrgWhBO9RP4ERXMcwT3KQ65JVOYRwYXFsBSohEM7tZE1yDFPusNPcqHK3Ivk8FSNYyj7TdkK00Jeb1SEET"; 
    
    // SOSTITUISCI QUESTI CON I TUOI ID PREZZO REALI CREATI SU STRIPE
    const ADDON_PRICE_IDS = {
        siae: "price_1S5NN8LyZ8FXl87PRrpQOXDm", // Esempio: Prezzo per la licenza SIAE
        video: "price_1S5QcrLyZ8FXl87PipiY314W",  // Esempio: Prezzo per il video addizionale
    };

    const MAX_PLAYS = 3;
    const RESET_PASSWORD = 'reset_ff_2025';

    let allSongs = [];
    let currentPlayingItem = null;
    let currentPlayingType = null;
    let currentUserEmail = '';
    let isMultiSelectMode = false;
    let shoppingCart = [];

    const loginScreen = document.getElementById('login-screen');
    const jukeboxContainer = document.getElementById('jukebox-container');
    const songListContainer = document.getElementById('song-list-container');
    const audioPlayer = document.getElementById('jukebox-audio-player');
    const videoPlayer = document.getElementById('jukebox-video-player');
    const footerPlayer = document.getElementById('footer-player');
    const footerPlayerTitle = document.getElementById('footer-player-title');
    const clientNameEl = document.getElementById('client-name');
    const allModalOverlays = document.querySelectorAll('.modal-overlay');

    // =============================================================
    // --- 2. LOGICA DI ACQUISTO FLESSIBILE (SIAE E VIDEO) ---
    // =============================================================
    function openPurchaseModal(songData) {
        const purchaseModal = document.getElementById('purchase-modal');
        const modalContent = purchaseModal.querySelector('#purchase-modal-content');
        const basePrice = parseFloat(songData.prezzo);

        let optionsHTML = `
            <div class="upsell-item" data-price="100" data-id="add-siae">
                <i class="fas fa-check-circle check-icon"></i>
                <div class="upsell-item-details">
                    <strong>Aggiungi Gestione Diritti SIAE</strong>
                    <span>Include il deposito dell'opera e la gestione burocratica completa (+100.00€).</span>
                </div>
            </div>`;

        if (songData.linkVideo && songData.linkVideo.trim() !== '' && songData.linkVideo.toUpperCase() !== 'FALSE') {
            optionsHTML += `
                <div class="upsell-item" data-price="49" data-id="add-video">
                    <i class="fas fa-check-circle check-icon"></i>
                    <div class="upsell-item-details">
                        <strong>Aggiungi Video Promozionale</strong>
                        <span>Un video ottimizzato per i tuoi canali social (+49.00€).</span>
                    </div>
                </div>`;
        }

        modalContent.innerHTML = `
            <h3>Finalizza il Tuo Acquisto</h3>
            <p>Stai per acquistare il brano:</p>
            <span class="song-title-highlight">${songData.titolo}</span>
            <div class="upsell-options">${optionsHTML}</div>
            <div class="info-box">
                <strong>Nota Fiscale:</strong> La cessione di opere dell'ingegno è esente da IVA. Il prezzo indicato è l'imponibile su cui, se sei un soggetto con Partita IVA, dovrai versare la ritenuta d'acconto del 20%.
            </div>
            <div id="purchase-summary">
                <button id="final-purchase-btn" class="acquista-btn">Vai al Pagamento - ${basePrice.toFixed(2)}€</button>
            </div>
        `;
        
        purchaseModal.style.display = 'flex';
        
        const finalBtn = modalContent.querySelector('#final-purchase-btn');
        const upsellItems = modalContent.querySelectorAll('.upsell-item');

        const updateTotal = () => {
            let currentTotal = basePrice;
            upsellItems.forEach(item => {
                if (item.classList.contains('selected')) {
                    currentTotal += parseFloat(item.dataset.price);
                }
            });
            finalBtn.textContent = `Vai al Pagamento - ${currentTotal.toFixed(2)}€`;
        };

        upsellItems.forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('selected');
                updateTotal();
            });
        });

        finalBtn.addEventListener('click', () => {
            finalBtn.textContent = 'Reindirizzo...';
            finalBtn.disabled = true;

            const checkoutData = {
                items: [{
                    title: songData.titolo,
                    price: basePrice,
                    addSIAE: modalContent.querySelector('.upsell-item[data-id="add-siae"]').classList.contains('selected'),
                    addVideo: modalContent.querySelector('.upsell-item[data-id="add-video"]')?.classList.contains('selected') || false,
                }]
            };
            redirectToCheckout(checkoutData);
        });
    }

    // === FIX #2: FUNZIONE DI CHECKOUT RESA PIÙ ROBUSTA ===
    function redirectToCheckout(data) {
        if (!STRIPE_PUBLISHABLE_KEY) {
            alert("Errore: Chiave Stripe non configurata.");
            return;
        }

        const lineItemsPayload = [];
        
        for (const item of data.items) {
            const unitAmount = Math.round(parseFloat(item.price) * 100);

            // Controllo di sicurezza: verifica che il prezzo sia un numero valido
            if (isNaN(unitAmount) || unitAmount <= 0) {
                console.error("Prezzo non valido per il brano:", item);
                alert(`Errore: il prezzo per il brano "${item.title}" non è valido. Controlla il foglio Google.`);
                const finalBtn = document.getElementById('final-purchase-btn');
                if (finalBtn) {
                    finalBtn.textContent = 'Riprova Pagamento';
                    finalBtn.disabled = false;
                }
                return; // Blocca l'esecuzione se il prezzo è errato
            }

            lineItemsPayload.push({
                price_data: {
                    currency: 'eur',
                    product_data: { name: `Brano: ${item.title}` },
                    unit_amount: unitAmount,
                },
                quantity: 1
            });

            if (item.addSIAE) {
                lineItemsPayload.push({ price: ADDON_PRICE_IDS.siae, quantity: 1 });
            }
            if (item.addVideo) {
                lineItemsPayload.push({ price: ADDON_PRICE_IDS.video, quantity: 1 });
            }
        }
        
        const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
        
        stripe.redirectToCheckout({
            lineItems: lineItemsPayload,
            mode: 'payment',
            allow_promotion_codes: true,
            successUrl: `${window.location.origin}${window.location.pathname}?payment=success`,
            cancelUrl: `${window.location.origin}${window.location.pathname}?payment=cancel`,
        }).catch(error => {
            console.error("ERRORE DA STRIPE:", error);
            alert("Si è verificato un errore con Stripe. Controlla la console.");
            const finalBtn = document.getElementById('final-purchase-btn');
             if (finalBtn) {
                finalBtn.textContent = 'Riprova Pagamento';
                finalBtn.disabled = false;
            }
        });
    }

    // =============================================================
    // --- 3. GESTIONE ACQUISTO MULTIPLO ---
    // =============================================================
    function toggleMultiSelectMode() {
        isMultiSelectMode = !isMultiSelectMode;
        const toggleBtn = document.getElementById('multi-select-toggle');
        const songItems = document.querySelectorAll('.song-item:not(.disabled)');

        if (isMultiSelectMode) {
            toggleBtn.innerHTML = '<i class="fas fa-check"></i> Termina Selezione';
            toggleBtn.style.backgroundColor = 'var(--success-color)';
            toggleBtn.style.borderColor = 'var(--success-color)';
            songItems.forEach(item => {
                const purchaseBtn = item.querySelector('.acquista-btn');
                if (purchaseBtn) {
                    purchaseBtn.innerHTML = '<i class="fas fa-cart-plus"></i> Aggiungi al Carrello';
                    purchaseBtn.classList.remove('acquista-btn');
                    purchaseBtn.classList.add('select-btn');
                }
                item.classList.add('multi-select-mode');
            });
        } else {
            toggleBtn.innerHTML = '<i class="fas fa-tasks"></i> Seleziona più brani';
            toggleBtn.style.backgroundColor = 'transparent';
            toggleBtn.style.borderColor = 'var(--primary-color)';
            songItems.forEach(item => {
                const selectBtn = item.querySelector('.select-btn');
                if (selectBtn) {
                    selectBtn.innerHTML = `Acquista da ${parseFloat(item.dataset.prezzo).toFixed(2)}€`;
                    selectBtn.classList.remove('select-btn', 'selected');
                    selectBtn.classList.add('acquista-btn');
                }
                item.classList.remove('multi-select-mode', 'selected-for-cart');
            });
            shoppingCart = [];
            updateCartBar();
        }
    }

    function handleMultiSelectClick(songItem, button) {
        const songId = songItem.dataset.id;
        const index = shoppingCart.findIndex(item => item.id === songId);

        if (index > -1) {
            shoppingCart.splice(index, 1);
            songItem.classList.remove('selected-for-cart');
            button.classList.remove('selected');
            button.innerHTML = '<i class="fas fa-cart-plus"></i> Aggiungi al Carrello';
        } else {
            shoppingCart.push({
                id: songId,
                title: songItem.dataset.titolo,
                price: parseFloat(songItem.dataset.prezzo)
            });
            songItem.classList.add('selected-for-cart');
            button.classList.add('selected');
            button.innerHTML = '<i class="fas fa-check"></i> Aggiunto';
        }
        updateCartBar();
    }
    
    // === FIX #1: FUNZIONE CARRELLO CORRETTA ===
    function updateCartBar() {
        const cartBar = document.getElementById('cart-bar');
        const cartInfo = document.getElementById('cart-info');
        if (shoppingCart.length > 0) {
            const total = shoppingCart.reduce((sum, item) => sum + item.price, 0);
            const itemText = shoppingCart.length === 1 ? 'brano' : 'brani';
            cartInfo.textContent = `${shoppingCart.length} ${itemText} selezionati - Totale Base: ${total.toFixed(2)}€`;
            cartBar.classList.add('visible'); // USA LA CLASSE CSS PER L'ANIMAZIONE
        } else {
            cartBar.classList.remove('visible'); // RIMUOVE LA CLASSE CSS
        }
    }

    // =============================================================
    // --- 4. RENDER E EVENT LISTENER ---
    // =============================================================
    function renderSongs(songsToRender) {
        songListContainer.innerHTML = '';
        const toCamelCase = (str) => str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)?/g, (match, chr) => chr ? chr.toUpperCase() : '').replace(/^./, (match) => match.toLowerCase());

        if (songsToRender.length > 0) {
            songsToRender.forEach(song => {
                const count = getPlayCounts()[song.id] || 0;
                const playsLeft = MAX_PLAYS - count;
                const isLocked = playsLeft <= 0;
                let purchaseHTML = '';

                if (song.prezzo && String(song.prezzo).trim() !== '' && song.stato?.toLowerCase() !== 'venduto' && !isLocked) {
                    purchaseHTML = `<button class="acquista-btn">Acquista da ${parseFloat(song.prezzo).toFixed(2)}€</button>`;
                } else if (song.stato?.toLowerCase() === 'venduto') {
                    purchaseHTML = `<p style="color: #f44336; font-weight: bold; grid-column: 1 / -1; align-self: center;">Brano Venduto</p>`;
                }
                
                const hasLyrics = song.liriche && song.liriche.trim() !== "";
                const hasVideo = song.link_video && song.link_video.trim() !== '' && song.link_video.toUpperCase() !== 'FALSE';
                const songItem = document.createElement('div');
                songItem.className = `song-item ${isLocked ? 'disabled' : ''}`;
                
                Object.keys(song).forEach(key => {
                    const camelCaseKey = toCamelCase(key);
                    songItem.dataset[camelCaseKey] = song[key];
                });
                
                const actionAudioBtn = `<button class="btn action-btn audio" title="${isLocked ? 'Limite ascolti' : 'Ascolta'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-headphones'}"></i> Audio</button>`;
                const actionVideoBtn = hasVideo ? `<button class="btn action-btn video" title="${isLocked ? 'Limite ascolti' : 'Guarda video'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-film'}"></i> Video</button>` : '<div></div>';
                const actionLyricsBtn = hasLyrics ? `<button class="btn action-btn lyrics" title="${isLocked ? 'Limite ascolti' : 'Leggi testo'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-file-lines'}"></i> Testo</button>` : '<div></div>';
                const infoBtnHTML = `<button class="btn info-btn top-row" title="Cosa include l'acquisto?"><i class="fas fa-info-circle"></i></button>`;
                const detailsHTML = (song.bpm || song.durata) ? `<div class="song-details">${song.bpm ? `<span><i class="fas fa-tachometer-alt"></i> ${song.bpm} BPM</span>` : ''}${song.durata ? `<span><i class="far fa-clock"></i> ${song.durata}</span>` : ''}</div>` : '';
                const playsLeftText = isLocked ? 'Limite ascolti raggiunto' : `Ascolti rimasti: ${playsLeft}`;
                
                songItem.innerHTML = `
                    <div class="song-item-top">
                        <div class="song-info">
                            <span class="title">${song.titolo}</span>
                            <div class="plays-left">${playsLeftText}</div>
                            ${detailsHTML}
                        </div>
                        ${infoBtnHTML}
                    </div>
                    <div class="song-actions">
                        ${actionAudioBtn}
                        ${actionVideoBtn}
                        ${actionLyricsBtn}
                        ${purchaseHTML} 
                    </div>`;
                songListContainer.appendChild(songItem);
            });
        } else {
            songListContainer.innerHTML = '<p>Nessun brano corrisponde ai filtri selezionati.</p>';
        }
    }
    
    function setupEventListeners() {
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('contact-form').addEventListener('submit', handleContactForm);
        document.getElementById('multi-select-toggle').addEventListener('click', toggleMultiSelectMode);
        
        document.getElementById('cart-checkout-btn').addEventListener('click', () => {
            if (shoppingCart.length === 0) return;
            redirectToCheckout({ items: shoppingCart });
        });

        songListContainer.addEventListener('click', function(e) {
            const songItem = e.target.closest('.song-item');
            if (!songItem || songItem.classList.contains('disabled')) return;

            const target = e.target;
            if (target.matches('.acquista-btn')) {
                openPurchaseModal(songItem.dataset);
            } else if (target.matches('.select-btn')) {
                handleMultiSelectClick(songItem, target);
            } else if (target.closest('.action-btn.audio') || target.closest('.title')) {
                if(isMultiSelectMode) {
                    const selectBtn = songItem.querySelector('.select-btn');
                    if(selectBtn) handleMultiSelectClick(songItem, selectBtn);
                } else {
                    handlePlay(songItem, 'audio');
                }
            } else if (target.closest('.action-btn.video')) {
                handlePlay(songItem, 'video');
            } else if (target.closest('.action-btn.lyrics')) {
                showLyrics(songItem);
            } else if (target.closest('.info-btn')) {
                openPurchaseInfoModal();
            } else if (isMultiSelectMode && target.closest('.song-item')) {
                const selectBtn = songItem.querySelector('.select-btn');
                if(selectBtn) handleMultiSelectClick(songItem, selectBtn);
            }
        });

        document.getElementById('show-contact-modal-btn').addEventListener('click', () => document.getElementById('contact-modal').style.display = 'flex');
        audioPlayer.addEventListener('contextmenu', e => e.preventDefault());
        videoPlayer.addEventListener('contextmenu', e => e.preventDefault());
        audioPlayer.addEventListener('play', () => currentPlayingItem?.classList.add('playing-audio'));
        videoPlayer.addEventListener('play', () => currentPlayingItem?.classList.add('playing-video'));
        audioPlayer.addEventListener('pause', () => currentPlayingItem?.classList.remove('playing-audio'));
        videoPlayer.addEventListener('pause', () => currentPlayingItem?.classList.remove('playing-video'));
        audioPlayer.addEventListener('ended', resetPlayingState);
        videoPlayer.addEventListener('ended', closeAllModals);

        allModalOverlays.forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); });
            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) closeBtn.addEventListener('click', () => closeAllModals());
        });
    }

    // =============================================================
    // --- 5. FUNZIONI CORE E HELPER (invariate) ---
    // =============================================================
    async function handleContactForm(e) { e.preventDefault(); const form = e.target; const formResult = document.getElementById('form-result'); const formData = new FormData(form); formResult.innerHTML = "Invio..."; const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; try { const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: formData }); const result = await res.json(); if (result.success) { formResult.innerHTML = "<span style='color: var(--success-color);'>Messaggio inviato!</span>"; form.reset(); setTimeout(() => closeAllModals(), 3000); } else { formResult.innerHTML = `<span style='color: #e53935;'>Errore: ${result.message}</span>`; } } catch (err) { formResult.innerHTML = "<span style='color: #e53935;'>Errore di rete.</span>"; } finally { btn.disabled = false; } }
    async function handleLogin(e) { e.preventDefault(); const email = document.getElementById('email-input').value.trim().toLowerCase(); if (!email) { alert('Per favore, inserisci un\'email.'); return; } currentUserEmail = email; const btn = e.target.querySelector('button'); btn.textContent = 'Verifico...'; btn.disabled = true; try { const url = `${sheetApiUrl}&emailCheck=${encodeURIComponent(email)}`; const res = await fetch(url); if (!res.ok) throw new Error('Errore di rete.'); const result = await res.json(); if (result.status === "ok" && result.name) { loginScreen.style.display = 'none'; jukeboxContainer.style.display = 'block'; clientNameEl.textContent = result.name; await loadMusicFromApi(email); } else { alert(result.message || 'Accesso non autorizzato.'); } } catch (err) { console.error('Errore login:', err); alert('Errore di comunicazione.'); } finally { btn.textContent = 'Accedi'; btn.disabled = false; } }
    async function loadMusicFromApi(userEmail) { songListContainer.innerHTML = `<p>Caricamento...</p>`; try { const url = `${sheetApiUrl}&userEmail=${encodeURIComponent(userEmail)}`; const res = await fetch(url); if (!res.ok) throw new Error('Errore di rete.'); const data = await res.json(); if (data.error || data.status === "error") throw new Error(data.message || 'Errore API.'); allSongs = data.songs; populateFilters(allSongs); applyFilters(); } catch (err) { console.error('Errore caricamento:', err); songListContainer.innerHTML = `<p style="color: #f44336;">${err.message}.</p>`; } }
    function populateFilters(songs) { const filters = { categoria: new Set(), argomento: new Set(), bpm: new Set() }; songs.forEach(s => { if (s.categoria && typeof s.categoria === 'string') { s.categoria.split(/[;,]/).forEach(cat => { const trimmedCat = cat.trim(); if (trimmedCat) filters.categoria.add(trimmedCat); }); } if (s.argomento && typeof s.argomento === 'string') { s.argomento.split(/[;,]/).forEach(arg => { const trimmedArg = arg.trim(); if (trimmedArg) filters.argomento.add(trimmedArg); }); } if (s.bpm) filters.bpm.add(s.bpm); }); const createBtns = (type, items, label) => { const cont = document.getElementById(`filter-${type}`); if (!cont) return; cont.innerHTML = ''; const allBtn = document.createElement('button'); allBtn.textContent = label; allBtn.value = ''; allBtn.className = 'active'; cont.appendChild(allBtn); [...items].sort((a, b) => isNaN(a) ? a.localeCompare(b) : a - b).forEach(item => { const btn = document.createElement('button'); btn.textContent = item; btn.value = item; cont.appendChild(btn); }); cont.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { cont.querySelectorAll('button').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); applyFilters(); } }); }; createBtns('categoria', filters.categoria, 'Tutte'); createBtns('argomento', filters.argomento, 'Tutti'); createBtns('bpm', filters.bpm, 'Tutti'); }
    function applyFilters() { const getActive = id => document.querySelector(`#filter-${id} button.active`)?.value ?? ''; const selectedCategory = getActive('categoria'); const selectedArgument = getActive('argomento'); const selectedBpm = getActive('bpm'); const filtered = allSongs.filter(song => { const categoryMatch = !selectedCategory || (song.categoria && song.categoria.split(/[;,]/).map(c => c.trim()).includes(selectedCategory)); const argumentMatch = !selectedArgument || (song.argomento && song.argomento.split(/[;,]/).map(a => a.trim()).includes(selectedArgument)); const bpmMatch = !selectedBpm || (song.bpm && String(song.bpm) === selectedBpm); return categoryMatch && argumentMatch && bpmMatch; }); renderSongs(filtered); if(isMultiSelectMode) { isMultiSelectMode = false; toggleMultiSelectMode(); } }
    function handlePlay(item, type = 'audio') { const isPlayingThisItem = item === currentPlayingItem && type === currentPlayingType; if (isPlayingThisItem) { if (type === 'audio') audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause(); else videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause(); return; } const counts = getPlayCounts(); const songId = item.dataset.id; let count = counts[songId] || 0; if (count >= MAX_PLAYS) { alert("Hai raggiunto il limite di ascolti per questo brano."); return; } resetPlayingState(); currentPlayingItem = item; currentPlayingType = type; if (type === 'audio') { footerPlayer.classList.add('visible'); footerPlayerTitle.textContent = item.dataset.titolo; audioPlayer.src = item.dataset.linkAscolto; audioPlayer.play(); } else if (type === 'video') { videoPlayer.src = item.dataset.linkVideo; document.getElementById('video-modal').style.display = 'flex'; videoPlayer.play(); } count++; counts[songId] = count; savePlayCounts(counts); trackPlay(songId, currentUserEmail); const playsLeftEl = item.querySelector('.plays-left'); if (playsLeftEl) { const playsLeft = MAX_PLAYS - count; if (playsLeft > 0) { playsLeftEl.textContent = `Ascolti rimasti: ${playsLeft}`; } else { item.classList.add('disabled'); playsLeftEl.textContent = 'Limite ascolti raggiunto'; } } }
    function getPlayCounts() { if (!currentUserEmail) return {}; return JSON.parse(localStorage.getItem(`jukeboxPlayCounts_${currentUserEmail}`)) || {}; }
    function savePlayCounts(counts) { if (!currentUserEmail) return; localStorage.setItem(`jukeboxPlayCounts_${currentUserEmail}`, JSON.stringify(counts)); }
    async function trackPlay(songId, userEmail) { try { await fetch(sheetApiUrl, { method: 'POST', mode: 'no-cors',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: songId, email: userEmail }) }); } catch (error) { console.error("Impossibile tracciare l'ascolto:", error); } }
    function showLyrics(item) { const modal = document.getElementById('lyrics-modal'); if (modal) { modal.querySelector('#lyrics-title').innerText = item.dataset.titolo; modal.querySelector('#lyrics-text').innerText = item.dataset.liriche || "Testo non disponibile."; modal.style.display = 'flex'; } }
    function openPurchaseInfoModal() { const modal = document.getElementById('purchase-info-modal'); if (modal) modal.style.display = 'flex'; }
    function closeAllModals() { allModalOverlays.forEach(m => m.style.display = 'none'); videoPlayer.pause(); videoPlayer.src = ''; if (currentPlayingType === 'video') resetPlayingState(); }
    function resetPlayingState() { if (currentPlayingItem) currentPlayingItem.classList.remove('playing-audio', 'playing-video'); currentPlayingItem = null; currentPlayingType = null; footerPlayer.classList.remove('visible'); audioPlayer.pause(); }
    function handleResetFromUrl() { const urlParams = new URLSearchParams(window.location.search); if (urlParams.get('action') === 'reset' && urlParams.get('password') === RESET_PASSWORD) { const email = urlParams.get('email'); if(email) { localStorage.removeItem(`jukeboxPlayCounts_${email.toLowerCase()}`); window.history.replaceState({}, document.title, window.location.pathname); alert(`Conteggio per ${email} resettato.`); } } }
    
    setupEventListeners();
    handleResetFromUrl();
});
