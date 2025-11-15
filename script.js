document.addEventListener('DOMContentLoaded', function() {
    // =============================================================
    // --- 1. CONFIGURAZIONE E VARIABILI GLOBALI ---
    // =============================================================
    const sheetApiUrl = 'https://script.google.com/macros/s/AKfycbw666DGD4BlSHuJwmVYcRLF9_qMJX2LXy_r6gCGVbjR_dXQDngQU-JttofSKOwUkIJZ/exec?source=jukebox';
    const STRIPE_PUBLISHABLE_KEY = "pk_test_51S0GLJLyZ8FXl87PPrgWhBO9RP4ERXMcwT3KQ65JVOYRwYXFsBSohEM7tZE1yDFPusNPcqHK3Ivk8FSNYyj7TdkK00Jeb1SEET"; 
    
    // ID dei prezzi dei tuoi prodotti ADD-ON su Stripe
    const ADDON_PRICE_IDS = {
        siae: "price_1S5NN8LyZ8FXl87PRrpQOXDm", // SOSTITUISCI CON IL TUO VERO ID PREZZO SIAE
        video: "price_1S5QcrLyZ8FXl87PipiY314W", // SOSTITUISCI CON IL TUO VERO ID PREZZO VIDEO
    };

    const MAX_PLAYS = 3;
    const RESET_PASSWORD = 'reset_ff_2025';

    let allSongs = [];
    let currentPlayingItem = null;
    let currentPlayingType = null;
    let currentUserEmail = '';
    let isMultiSelectMode = false;
    let shoppingCart = [];

    // Riferimenti agli elementi DOM
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

        // Costruisci le opzioni dinamicamente
        let optionsHTML = `
            <div class="upsell-item" data-price="100" data-id="add-siae">
                <i class="fas fa-check-circle check-icon"></i>
                <div class="upsell-item-details">
                    <strong>Aggiungi Gestione Diritti SIAE</strong>
                    <span>Include il deposito dell'opera e la gestione burocratica completa per la tutela dei diritti d'autore (+100.00€).</span>
                </div>
            </div>`;

        // Aggiungi l'opzione video SOLO se il link esiste nel foglio Google
        if (songData.linkVideo && songData.linkVideo.trim() !== "") {
            optionsHTML += `
                <div class="upsell-item" data-price="49" data-id="add-video">
                    <i class="fas fa-check-circle check-icon"></i>
                    <div class="upsell-item-details">
                        <strong>Aggiungi Video Promozionale</strong>
                        <span>Un video ottimizzato per i tuoi canali social (+49.00€).</span>
                    </div>
                </div>`;
        }

        // Costruisci il contenuto completo del modal
        modalContent.innerHTML = `
            <h3>Finalizza il Tuo Acquisto</h3>
            <p>Stai per acquistare il brano:</p>
            <span class="song-title-highlight">${songData.titolo}</span>
            <div class="upsell-options">${optionsHTML}</div>
            <div class="info-box">
                <strong>Nota Fiscale:</strong> La cessione di opere dell'ingegno è esente da IVA. Il prezzo indicato è l'imponibile su cui, se sei un soggetto con Partita IVA, dovrai versare la ritenuta d'acconto del 20% come sostituto d'imposta. Riceverai una ricevuta dettagliata.
            </div>
            <div id="purchase-summary">
                <button id="final-purchase-btn" class="acquista-btn">Vai al Pagamento - ${basePrice.toFixed(2)}€</button>
            </div>
        `;
        
        purchaseModal.style.display = 'flex';
        
        const finalBtn = modalContent.querySelector('#final-purchase-btn');
        const upsellItems = modalContent.querySelectorAll('.upsell-item');

        // Funzione per aggiornare il totale dinamicamente
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

        // Gestione del click sul pulsante di acquisto finale
        finalBtn.addEventListener('click', () => {
            finalBtn.textContent = 'Reindirizzo...';
            finalBtn.disabled = true;

            const checkoutData = {
                items: [{
                    id: songData.id,
                    title: songData.titolo,
                    price: basePrice,
                    addSIAE: modalContent.querySelector('.upsell-item[data-id="add-siae"]').classList.contains('selected'),
                    addVideo: modalContent.querySelector('.upsell-item[data-id="add-video"]')?.classList.contains('selected') || false,
                }]
            };
            redirectToCheckout(checkoutData);
        });
    }

    function redirectToCheckout(data) {
        if (!STRIPE_PUBLISHABLE_KEY) {
            alert("Errore: Chiave Stripe non configurata.");
            return;
        }

        const lineItemsPayload = [];
        let clientReferenceIds = [];
        
        for (const item of data.items) {
            // Voce per il brano principale (creato al volo)
            lineItemsPayload.push({
                price_data: {
                    currency: 'eur',
                    product_data: { name: `Brano: ${item.title}` },
                    unit_amount: Math.round(parseFloat(item.price) * 100),
                },
                quantity: 1
            });
            clientReferenceIds.push(item.id);

            // Aggiungi gli add-on usando i loro Price ID
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
            clientReferenceId: clientReferenceIds.join(',')
        }).catch(error => {
            console.error("ERRORE DA STRIPE:", error);
            alert("Si è verificato un errore con Stripe. Controlla la console.");
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

        if (index > -1) { // Se è già nel carrello, lo rimuove
            shoppingCart.splice(index, 1);
            songItem.classList.remove('selected-for-cart');
            button.classList.remove('selected');
            button.innerHTML = '<i class="fas fa-cart-plus"></i> Aggiungi al Carrello';
        } else { // Altrimenti lo aggiunge
            shoppingCart.push({
                id: songId,
                title: songItem.dataset.titolo,
                price: parseFloat(songItem.dataset.prezzo),
                // Per il carrello, gli add-on sono gestiti al checkout finale
                addSIAE: false, 
                addVideo: false
            });
            songItem.classList.add('selected-for-cart');
            button.classList.add('selected');
            button.innerHTML = '<i class="fas fa-check"></i> Aggiunto';
        }
        updateCartBar();
    }
    
    function updateCartBar() {
        const cartBar = document.getElementById('cart-bar');
        const cartInfo = document.getElementById('cart-info');
        if (shoppingCart.length > 0) {
            const total = shoppingCart.reduce((sum, item) => sum + item.price, 0);
            const itemText = shoppingCart.length === 1 ? 'brano' : 'brani';
            cartInfo.textContent = `${shoppingCart.length} ${itemText} selezionati - Totale: ${total.toFixed(2)}€`;
            cartBar.classList.add('visible');
        } else {
            cartBar.classList.remove('visible');
        }
    }

    // =============================================================
    // --- 4. RENDER DEI BRANI E GESTIONE EVENTI ---
    // =============================================================
    function renderSongs(songsToRender) {
        songListContainer.innerHTML = '';
        const toCamelCase = (str) => {
            if (!str) return '';
            return str.toLowerCase().replace(/[^a-zA-Z0-9]+(.)?/g, (match, chr) => chr ? chr.toUpperCase() : '').replace(/^./, (match) => match.toLowerCase());
        };

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
                const hasVideo = song.link_video && song.link_video.trim() !== "";
                const songItem = document.createElement('div');
                songItem.className = `song-item ${isLocked ? 'disabled' : ''}`;
                
                // Popola i dataset per un accesso facile ai dati
                Object.keys(song).forEach(key => {
                    const camelCaseKey = toCamelCase(key);
                    if (camelCaseKey) {
                        songItem.dataset[camelCaseKey] = song[key];
                    }
                });
                
                const actionAudioBtn = `<button class="btn action-btn audio" title="${isLocked ? 'Limite ascolti' : 'Ascolta'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-headphones'}"></i> Audio</button>`;
                const actionVideoBtn = hasVideo ? `<button class="btn action-btn video" title="${isLocked ? 'Limite ascolti' : 'Guarda video'}" data-video-src="${song.link_video}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-film'}"></i> Video</button>` : '<div></div>';
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
        
        // Listener per il pulsante multi-selezione
        document.getElementById('multi-select-toggle').addEventListener('click', toggleMultiSelectMode);
        
        // Listener per il checkout del carrello
        document.getElementById('cart-checkout-btn').addEventListener('click', () => {
            if (shoppingCart.length === 0) return;
            // Al checkout del carrello, non offriamo opzioni extra per semplicità.
            // Si acquistano solo i brani base.
            redirectToCheckout({ items: shoppingCart });
        });

        // Listener principale sulla lista delle canzoni
        songListContainer.addEventListener('click', function(e) {
            const songItem = e.target.closest('.song-item');
            if (!songItem || songItem.classList.contains('disabled')) return;

            const target = e.target;

            if (target.matches('.acquista-btn')) {
                // Se si clicca "Acquista", apri il modal con le opzioni
                openPurchaseModal(songItem.dataset);
            } else if (target.matches('.select-btn')) {
                // Se si clicca "Aggiungi al carrello"
                handleMultiSelectClick(songItem, target);
            } else if (target.closest('.action-btn.audio') || target.closest('.title')) {
                if(isMultiSelectMode) { // Se siamo in multi-selezione, cliccare sul titolo aggiunge al carrello
                    const selectBtn = songItem.querySelector('.select-btn');
                    if(selectBtn) handleMultiSelectClick(songItem, selectBtn);
                } else { // Altrimenti, riproduce l'audio
                    handlePlay(songItem);
                }
            } else if (target.closest('.action-btn.video')) {
                handlePlay(songItem, 'video');
            } else if (target.closest('.action-btn.lyrics')) {
                showLyrics(songItem);
            } else if (target.closest('.info-btn')) {
                openPurchaseInfoModal();
            } else if (isMultiSelectMode && target.closest('.song-item')) { // Clic su qualsiasi parte del brano in modalità multi-select
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
    async function handleContactForm(e) { e.preventDefault(); const form = e.target; const formResult = form.querySelector('#form-result'); const formData = new FormData(form); formResult.innerHTML = "Invio..."; const btn = form.querySelector('button[type="submit"]'); btn.disabled = true; try { const res = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: formData }); const result = await res.json(); if (result.success) { formResult.innerHTML = "<span style='color: var(--success-color);'>Messaggio inviato!</span>"; form.reset(); setTimeout(() => closeAllModals(), 3000); } else { formResult.innerHTML = `<span style='color: #e53935;'>Errore: ${result.message}</span>`; } } catch (err) { formResult.innerHTML = "<span style='color: #e53935;'>Errore di rete.</span>"; } finally { btn.disabled = false; } }
    async function handleLogin(e) { e.preventDefault(); const email = document.getElementById('email-input').value.trim().toLowerCase(); if (!email) { alert('Per favore, inserisci un\'email.'); return; } currentUserEmail = email; const btn = e.target.querySelector('button'); btn.textContent = 'Verifico...'; btn.disabled = true; try { const url = `${sheetApiUrl}&emailCheck=${encodeURIComponent(email)}`; const res = await fetch(url); if (!res.ok) throw new Error('Errore di rete.'); const result = await res.json(); if (result.status === "ok" && result.name) { loginScreen.style.display = 'none'; jukeboxContainer.style.display = 'block'; clientNameEl.textContent = result.name; await loadMusicFromApi(email); } else { alert(result.message || 'Accesso non autorizzato.'); } } catch (err) { console.error('Errore login:', err); alert('Errore di comunicazione.'); } finally { btn.textContent = 'Accedi'; btn.disabled = false; } }
    async function loadMusicFromApi(userEmail) { songListContainer.innerHTML = `<p>Caricamento...</p>`; try { const url = `${sheetApiUrl}&userEmail=${encodeURIComponent(userEmail)}`; const res = await fetch(url); if (!res.ok) throw new Error('Errore di rete.'); const data = await res.json(); if (data.error || data.status === "error") throw new Error(data.message || 'Errore API.'); allSongs = data.songs; populateFilters(allSongs); applyFilters(); } catch (err) { console.error('Errore caricamento:', err); songListContainer.innerHTML = `<p style="color: #f44336;">${err.message}.</p>`; } }
    function populateFilters(songs) { const filters = { categoria: new Set(), argomento: new Set(), bpm: new Set() }; songs.forEach(s => { if (s.categoria && typeof s.categoria === 'string') { s.categoria.split(/[;,]/).forEach(cat => { const trimmedCat = cat.trim(); if (trimmedCat) filters.categoria.add(trimmedCat); }); } if (s.argomento && typeof s.argomento === 'string') { s.argomento.split(/[;,]/).forEach(arg => { const trimmedArg = arg.trim(); if (trimmedArg) filters.argomento.add(trimmedArg); }); } if (s.bpm) filters.bpm.add(s.bpm); }); const createBtns = (type, items, label) => { const cont = document.getElementById(`filter-${type}`); if (!cont) return; cont.innerHTML = ''; const allBtn = document.createElement('button'); allBtn.textContent = label; allBtn.value = ''; allBtn.className = 'active'; cont.appendChild(allBtn); [...items].sort((a, b) => isNaN(a) ? a.localeCompare(b) : a - b).forEach(item => { const btn = document.createElement('button'); btn.textContent = item; btn.value = item; cont.appendChild(btn); }); cont.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { cont.querySelectorAll('button').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); applyFilters(); } }); }; createBtns('categoria', filters.categoria, 'Tutte'); createBtns('argomento', filters.argomento, 'Tutti'); createBtns('bpm', filters.bpm, 'Tutti'); }
    function applyFilters() { const getActive = id => document.querySelector(`#filter-${id} button.active`)?.value ?? ''; const selectedCategory = getActive('categoria'); const selectedArgument = getActive('argomento'); const selectedBpm = getActive('bpm'); const filtered = allSongs.filter(song => { const categoryMatch = !s
