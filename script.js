document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURAZIONE E VARIABILI GLOBALI ---
    const sheetApiUrl = 'https://script.google.com/macros/s/AKfycbw666DGD4BlSHuJwmVYcRLF9_qMJX2LXy_r6gCGVbjR_dXQDngQU-JttofSKOwUkIJZ/exec?source=jukebox';
    
    // !!! IMPORTANTE: INSERISCI LA TUA CHIAVE PUBBLICABILE DI STRIPE QUI !!!
    const STRIPE_PUBLISHABLE_KEY = "pk_test_51S0GLJLyZ8FXl87PPrgWhBO9RP4ERXMcwT3KQ65JVOYRwYXFsBSohEM7tZE1yDFPusNPcqHK3Ivk8FSNYyj7TdkK00Jeb1SEET"; 
    
    const MAX_PLAYS = 3;
    const RESET_PASSWORD = 'reset_ff_2025';

    let allSongs = [];
    let currentPlayingItem = null;
    let currentPlayingType = null;
    let currentUserEmail = '';

    const loginScreen = document.getElementById('login-screen');
    const jukeboxContainer = document.getElementById('jukebox-container');
    const loginForm = document.getElementById('login-form');
    const contactForm = document.getElementById('contact-form');
    const formResult = document.getElementById('form-result');
    const clientNameEl = document.getElementById('client-name');
    const songListContainer = document.getElementById('song-list-container');
    const audioPlayer = document.getElementById('jukebox-audio-player');
    const videoPlayer = document.getElementById('jukebox-video-player');
    const footerPlayer = document.getElementById('footer-player');
    const footerPlayerTitle = document.getElementById('footer-player-title');
    const modals = { 
        lyrics: document.getElementById('lyrics-modal'), 
        contact: document.getElementById('contact-modal'), 
        gadget: document.getElementById('gadget-modal'), 
        purchaseInfo: document.getElementById('purchase-info-modal'), 
        video: document.getElementById('video-modal'),
        purchase: document.getElementById('purchase-modal'),
        weddingRequest: document.getElementById('wedding-request-modal') 
    };

    setupEventListeners();
    handleResetFromUrl();

    // --- LOGICA DI ACQUISTO CON MODALE INTERATTIVA ---
    function openPurchaseModal(songData) {
        const modalContent = modals.purchase.querySelector('#purchase-modal-content');
        const basePrice = parseFloat(songData.price);
        
        modalContent.innerHTML = `
            <h3>Finalizza il Tuo Acquisto</h3>
            <p>Stai per acquistare il brano:</p>
            <span class="song-title-highlight">${songData.title}</span>
            <div class="upsell-options">
                <div class="upsell-item" data-price="49" data-id="add-video">
                    <i class="fas fa-check-circle check-icon"></i>
                    <div class="upsell-item-details">
                        <strong>Aggiungi Video per Social</strong>
                        <span>Ottimizzato per i tuoi canali (+49.00€)</span>
                    </div>
                </div>
                <div class="upsell-item" data-price="49" data-id="add-gadget">
                    <i class="fas fa-check-circle check-icon"></i>
                    <div class="upsell-item-details">
                        <strong>Aggiungi T-Shirt Brandizzata</strong>
                        <span>Con il tuo logo, design incluso (+49.00€)</span>
                    </div>
                </div>
            </div>
            <div id="purchase-summary">
                <button id="final-purchase-btn" class="acquista-btn">
                    Vai al Pagamento - ${basePrice.toFixed(2)}€
                </button>
            </div>
        `;
        
        modals.purchase.style.display = 'flex';
        
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
            const addVideo = modalContent.querySelector('.upsell-item[data-id="add-video"]').classList.contains('selected');
            const addGadget = modalContent.querySelector('.upsell-item[data-id="add-gadget"]').classList.contains('selected');
            
            finalBtn.textContent = 'Reindirizzo...';
            finalBtn.disabled = true;

            redirectToDynamicCheckout({
                songId: songData.id,
                songTitle: songData.title,
                songPrice: songData.price,
                songTier: songData.tier,
                addVideo: addVideo,
                addGadget: addGadget,
            });
        });
    }

    function redirectToDynamicCheckout(data) {
        if (!STRIPE_PUBLISHABLE_KEY) {
            alert("Errore: Chiave Pubblicabile di Stripe non configurata.");
            const finalBtn = document.getElementById('final-purchase-btn');
            if (finalBtn) { finalBtn.disabled = false; }
            return;
        }

        const priceIds = {
            argento: "price_1S5jNgLyZ8FXl87P615MFyDd", 
            oro:     "price_1S5jNgLyZ8FXl87PqUvZChRT",     
            platino: "price_1S5jNgLyZ8FXl87PtN7o5rQj", 
            video:   "price_1S5QcrLyZ8FXl87PipiY314W",    
            gadget:  "price_1S5NN8LyZ8FXl87PRrpQOXDm"  
        };

        const tierKey = data.songTier.toLowerCase();
        const songPriceId = priceIds[tierKey];

        if (!songPriceId) {
            alert(`Errore: Tier "${data.songTier}" non valido o ID Prezzo non configurato.`);
            const finalBtn = document.getElementById('final-purchase-btn');
            if (finalBtn) { finalBtn.disabled = false; }
            return;
        }

        const lineItemsPayload = [{
            price: songPriceId,
            quantity: 1
        }];

        if (data.addVideo) {
            lineItemsPayload.push({ price: priceIds.video, quantity: 1 });
        }
        if (data.addGadget) {
            lineItemsPayload.push({ price: priceIds.gadget, quantity: 1 });
        }

        const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
        
        stripe.redirectToCheckout({
            lineItems: lineItemsPayload,
            mode: 'payment',
            successUrl: window.location.href.split('?')[0] + '?payment=success',
            cancelUrl: window.location.href.split('?')[0] + '?payment=cancel',
            clientReferenceId: data.songId
        }).catch(error => {
            console.error("ERRORE DA STRIPE:", error);
            alert("Si è verificato un errore con Stripe. Controlla la console.");
            const finalBtn = document.getElementById('final-purchase-btn');
            if (finalBtn) {
                finalBtn.textContent = 'Errore - Riprova Pagamento';
                finalBtn.disabled = false;
            }
        });
    }

    // --- RENDER DEI BRANI ---
    function renderSongs(songsToRender) {
        songListContainer.innerHTML = '';
        if (songsToRender.length > 0) {
            songsToRender.forEach(song => {
                const count = getPlayCounts()[song.id] || 0;
                const playsLeft = MAX_PLAYS - count;
                const isLocked = playsLeft <= 0;
                const isWeddingSong = song.matrimonio === true;
                let purchaseHTML = '';

                if (isWeddingSong && !isLocked) {
                    purchaseHTML = `<button class="acquista-btn wedding-request-btn" data-song-title="${song.titolo}"><i class="fas fa-ring"></i> Crea la Tua Canzone Nuziale</button>`;
                } else if (song.stripe_link && song.stripe_link.startsWith('http') && !isLocked) {
                    purchaseHTML = `<a href="${song.stripe_link}" target="_blank" class="acquista-btn"><i class="fas fa-shopping-cart"></i> Acquista Ora (Prezzo Fisso)</a>`;
                } else if (song.prezzo && song.stato?.toLowerCase() !== 'venduto' && !isLocked) {
                    purchaseHTML = `<button class="acquista-btn open-purchase-modal-btn" data-song-id="${song.id}" data-song-title="${song.titolo}" data-song-price="${song.prezzo}" data-song-tier="${song.tier}">Acquista da ${parseFloat(song.prezzo).toFixed(2)}€</button>`;
                } else if (song.stato?.toLowerCase() === 'venduto') {
                    purchaseHTML = `<p style="color: #f44336; font-weight: bold; grid-column: 1 / -1; align-self: center;">Brano Venduto</p>`;
                }
                
                let tierBadge = '';
                if (song.tier) {
                    let tierColor = '#c0c0c0';
                    if (song.tier.toLowerCase().includes('oro')) tierColor = '#ffd700';
                    if (song.tier.toLowerCase().includes('platino')) tierColor = '#e5e4e2';
                    tierBadge = `<span style="background-color: ${tierColor}; color: #121212; padding: 3px 8px; font-size: 0.7em; font-weight: 600; border-radius: 10px; margin-left: 10px;">${song.tier}</span>`;
                }
                const hasLyrics = song.liriche && song.liriche.trim() !== "";
                const hasVideo = song.link_video && song.link_video.trim() !== "";
                const actionAudioBtn = `<button class="btn action-btn audio" title="${isLocked ? 'Limite ascolti' : 'Ascolta'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-headphones'}"></i> Audio</button>`;
                const actionVideoBtn = hasVideo ? `<button class="btn action-btn video" title="${isLocked ? 'Limite ascolti' : 'Guarda video'}" data-video-src="${song.link_video}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-film'}"></i> Video</button>` : '<div></div>';
                const actionLyricsBtn = hasLyrics ? `<button class="btn action-btn lyrics" title="${isLocked ? 'Limite ascolti' : 'Leggi testo'}"><i class="fas ${isLocked ? 'fa-lock' : 'fa-file-lines'}"></i> Testo</button>` : '<div></div>';
                const infoBtnHTML = `<button class="btn info-btn top-row" title="Cosa include l'acquisto?"><i class="fas fa-info-circle"></i></button>`;
                const detailsHTML = (song.bpm || song.durata) ? `<div class="song-details">${song.bpm ? `<span><i class="fas fa-tachometer-alt"></i> ${song.bpm} BPM</span>` : ''}${song.durata ? `<span><i class="far fa-clock"></i> ${song.durata}</span>` : ''}</div>` : '';
                const playsLeftText = isLocked ? 'Limite ascolti raggiunto' : `Ascolti rimasti: ${playsLeft}`;
                
                const songItem = document.createElement('div');
                songItem.className = `song-item ${isLocked ? 'disabled' : ''}`;
                songItem.dataset.id = song.id;
                songItem.dataset.src = song.link_ascolto;
                songItem.dataset.title = song.titolo;
                songItem.dataset.lyrics = hasLyrics ? song.liriche.replace(/"/g, '&quot;') : '';

                songItem.innerHTML = `
                    <div class="song-item-top">
                        <div class="song-info">
                            <span class="title">${song.titolo}${tierBadge}</span>
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
    
    // --- SETUP DEGLI EVENT LISTENER ---
    function setupEventListeners() {
        loginForm.addEventListener('submit', handleLogin);
        contactForm.addEventListener('submit', handleContactForm);

        songListContainer.addEventListener('click', function(e) {
            const target = e.target.closest('.btn, .open-purchase-modal-btn, .wedding-request-btn, .title, .acquista-btn');
            if (!target) return;
            
            const songItem = target.closest('.song-item');
            if (target.matches('a.acquista-btn')) { // Se è un link diretto, lascialo funzionare
                 return;
            }

            if (!songItem || songItem.classList.contains('disabled')) return;

            if (target.matches('.open-purchase-modal-btn')) {
                openPurchaseModal({
                    id: target.dataset.songId,
                    title: target.dataset.songTitle,
                    price: target.dataset.songPrice,
                    tier: target.dataset.songTier,
                });
            } else if (target.matches('.wedding-request-btn')) {
                const songTitle = target.dataset.songTitle;
                modals.weddingRequest.querySelector('#base-song-input').value = songTitle;
                modals.weddingRequest.style.display = 'flex';
            } else if (target.matches('.action-btn.audio') || target.matches('.title')) {
                handlePlay(songItem, 'audio');
            } else if (target.matches('.action-btn.video')) {
                handlePlay(songItem, 'video', target.dataset.videoSrc);
            } else if (target.matches('.action-btn.lyrics')) {
                showLyrics(songItem);
            } else if (target.matches('.info-btn')) {
                modals.purchaseInfo.style.display = 'flex';
            }
        });

        document.getElementById('show-contact-modal-btn').addEventListener('click', () => modals.contact.style.display = 'flex');
        document.getElementById('show-gadget-modal-btn').addEventListener('click', () => modals.gadget.style.display = 'flex');
        document.getElementById('contact-for-gadgets-btn')?.addEventListener('click', () => { closeAllModals(); modals.contact.style.display = 'flex'; });
        
        audioPlayer.addEventListener('contextmenu', e => e.preventDefault());
        videoPlayer.addEventListener('contextmenu', e => e.preventDefault());
        audioPlayer.addEventListener('play', updatePlayingUI);
        videoPlayer.addEventListener('play', updatePlayingUI);
        audioPlayer.addEventListener('pause', updatePausedUI);
        videoPlayer.addEventListener('pause', updatePausedUI);
        audioPlayer.addEventListener('ended', resetPlayingState);
        videoPlayer.addEventListener('ended', closeAllModals);
        
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) closeAllModals(); });
            modal.querySelector('.modal-close')?.addEventListener('click', () => closeAllModals());
        });
    }

    // --- FUNZIONI CORE ---
    async function handleLogin(e) { 
        e.preventDefault(); 
        const email = document.getElementById('email-input').value.trim().toLowerCase(); 
        if (!email) { alert('Per favore, inserisci un\'email.'); return; } 
        currentUserEmail = email; 
        const btn = e.target.querySelector('button'); 
        btn.textContent = 'Verifico...'; 
        btn.disabled = true; 
        try { 
            const url = new URL(sheetApiUrl); 
            url.searchParams.append('emailCheck', email); 
            const res = await fetch(url); 
            if (!res.ok) throw new Error('Errore di rete.'); 
            const result = await res.json(); 
            if (result.status === "ok" && result.name) { 
                loginScreen.style.display = 'none'; 
                jukeboxContainer.style.display = 'block'; 
                clientNameEl.textContent = result.name; 
                await loadMusicFromApi(email); 
            } else { 
                alert(result.message || 'Accesso non autorizzato.'); 
            } 
        } catch (err) { 
            console.error('Errore login:', err); 
            alert('Errore di comunicazione.'); 
        } finally { 
            btn.textContent = 'Accedi'; 
            btn.disabled = false; 
        } 
    }

    async function loadMusicFromApi(userEmail) { 
        songListContainer.innerHTML = `<p>Caricamento...</p>`; 
        try { 
            const url = new URL(sheetApiUrl); 
            url.searchParams.append('userEmail', userEmail); 
            const res = await fetch(url); 
            if (!res.ok) throw new Error('Errore di rete.'); 
            const songs = await res.json(); 
            if (songs.error || songs.status === "error") throw new Error(songs.message || 'Errore API.'); 
            allSongs = songs.songs; 
            populateFilters(allSongs); 
            applyFilters(); 
        } catch (err) { 
            console.error('Errore caricamento:', err); 
            songListContainer.innerHTML = `<p style="color: #f44336;">${err.message}.</p>`; 
        } 
    }

    function populateFilters(songs) {
        const filters = { categoria: new Set(), argomento: new Set(), bpm: new Set() };
        songs.forEach(s => {
            if (s.categoria && typeof s.categoria === 'string') {
                s.categoria.split(/[;,]/).forEach(cat => {
                    const trimmedCat = cat.trim();
                    if (trimmedCat) filters.categoria.add(trimmedCat);
                });
            }
            if (s.argomento && typeof s.argomento === 'string') {
                s.argomento.split(/[;,]/).forEach(arg => {
                    const trimmedArg = arg.trim();
                    if (trimmedArg) filters.argomento.add(trimmedArg);
                });
            }
            if (s.bpm) {
                filters.bpm.add(s.bpm);
            }
        });

        const createBtns = (type, items, label) => {
            const cont = document.getElementById(`filter-${type}`);
            if (!cont) return;
            cont.innerHTML = '';
            const allBtn = document.createElement('button');
            allBtn.textContent = label;
            allBtn.value = '';
            allBtn.className = 'active';
            cont.appendChild(allBtn);
            [...items].sort((a, b) => isNaN(a) ? a.localeCompare(b) : a - b).forEach(item => {
                const btn = document.createElement('button');
                btn.textContent = item;
                btn.value = item;
                cont.appendChild(btn);
            });
            cont.addEventListener('click', e => {
                if (e.target.tagName === 'BUTTON') {
                    cont.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    applyFilters();
                }
            });
        };
        createBtns('categoria', filters.categoria, 'Tutte');
        createBtns('argomento', filters.argomento, 'Tutti');
        createBtns('bpm', filters.bpm, 'Tutti');
    }

    function applyFilters() {
        const getActive = id => document.querySelector(`#filter-${id} button.active`)?.value ?? '';
        const selectedCategory = getActive('categoria');
        const selectedArgument = getActive('argomento');
        const selectedBpm = getActive('bpm');
        const filtered = allSongs.filter(song => {
            const categoryMatch = !selectedCategory || (song.categoria && song.categoria.split(/[;,]/).map(c => c.trim()).includes(selectedCategory));
            const argumentMatch = !selectedArgument || (song.argomento && song.argomento.split(/[;,]/).map(a => a.trim()).includes(selectedArgument));
            const bpmMatch = !selectedBpm || (song.bpm && String(song.bpm) === selectedBpm);
            return categoryMatch && argumentMatch && bpmMatch;
        });
        renderSongs(filtered);
    }
    
    // --- FUNZIONI PLAYER ---
    function handlePlay(item, type, sourceUrl = null) {
        const isPlayingThisItem = item === currentPlayingItem && type === currentPlayingType;
        if (isPlayingThisItem) {
            if (type === 'audio') audioPlayer.paused ? audioPlayer.play() : audioPlayer.pause();
            else videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause();
            return;
        }

        const counts = getPlayCounts();
        const songId = item.dataset.id;
        let count = counts[songId] || 0;
        if (count >= MAX_PLAYS) {
            alert("Hai raggiunto il limite di ascolti per questo brano.");
            return;
        }
        
        resetPlayingState();
        currentPlayingItem = item;
        currentPlayingType = type;

        if (type === 'audio') {
            footerPlayer.classList.add('visible');
            footerPlayerTitle.textContent = item.dataset.title;
            audioPlayer.src = item.dataset.src;
            audioPlayer.play();
        } else if (type === 'video') {
            videoPlayer.src = sourceUrl;
            modals.video.style.display = 'flex';
            videoPlayer.play();
        }

        count++;
        counts[songId] = count;
        savePlayCounts(counts);
        trackPlay(songId, currentUserEmail);
        
        const playsLeftEl = item.querySelector('.plays-left');
        if (playsLeftEl) {
            const playsLeft = MAX_PLAYS - count;
            playsLeftEl.textContent = playsLeft > 0 ? `Ascolti rimasti: ${playsLeft}` : 'Limite ascolti raggiunto';
            if (playsLeft <= 0) {
                 // Ricarica la lista per disabilitare il brano correttamente
                 applyFilters();
            }
        }
    }
    
    // --- FUNZIONI HELPER ---
    function getPlayCounts() { if (!currentUserEmail) return {}; return JSON.parse(localStorage.getItem(`jukeboxPlayCounts_${currentUserEmail}`)) || {}; }
    function savePlayCounts(counts) { if (!currentUserEmail) return; localStorage.setItem(`jukeboxPlayCounts_${currentUserEmail}`, JSON.stringify(counts)); }
    async function trackPlay(songId, userEmail) { try { await fetch(sheetApiUrl, { method: 'POST', mode: 'no-cors',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: songId, email: userEmail }) }); } catch (error) { console.error("Impossibile tracciare l'ascolto:", error); } }
    function showLyrics(item) { if (modals.lyrics) { modals.lyrics.querySelector('#lyrics-title').innerText = item.dataset.title; modals.lyrics.querySelector('#lyrics-text').innerText = item.dataset.lyrics || "Testo non disponibile."; modals.lyrics.style.display = 'flex'; } }
    function closeAllModals() { Object.values(modals).forEach(modal => { if(modal) modal.style.display = 'none' }); videoPlayer.pause(); videoPlayer.src = ''; if (currentPlayingType === 'video') resetPlayingState(); }
    function resetPlayingState() { if (currentPlayingItem) currentPlayingItem.classList.remove('playing-audio', 'playing-video'); currentPlayingItem = null; currentPlayingType = null; footerPlayer.classList.remove('visible'); audioPlayer.pause(); }
    function updatePlayingUI() { if (currentPlayingItem) { document.querySelectorAll('.song-item').forEach(item => item.classList.remove('playing-audio', 'playing-video')); if (currentPlayingType === 'audio') currentPlayingItem.classList.add('playing-audio'); else currentPlayingItem.classList.add('playing-video'); } }
    function updatePausedUI() { document.querySelectorAll('.song-item').forEach(item => item.classList.remove('playing-audio', 'playing-video')); }
    async function handleContactForm(e) { e.preventDefault(); const formData = new FormData(contactForm); formResult.innerHTML = "Invio..."; const submitButton = contactForm.querySelector('button'); submitButton.disabled = true; try { const response = await fetch('https://api.web3forms.com/submit', { method: 'POST', body: formData }); const result = await response.json(); if (result.success) { formResult.innerHTML = "<span style='color: #4CAF50;'>Inviato!</span>"; contactForm.reset(); setTimeout(() => { formResult.innerHTML = ''; closeAllModals(); }, 4000); } else { formResult.innerHTML = `<span style='color: #e53935;'>Errore: ${result.message}</span>`; } } catch (error) { console.error('Errore form:', error); formResult.innerHTML = "<span style='color: #e53935;'>Errore.</span>"; } finally { submitButton.disabled = false; } }
    function handleResetFromUrl() { const urlParams = new URLSearchParams(window.location.search); if (urlParams.get('action') === 'reset' && urlParams.get('password') === RESET_PASSWORD) { const email = urlParams.get('email'); if(email) { localStorage.removeItem(`jukeboxPlayCounts_${email.toLowerCase()}`); window.history.replaceState({}, document.title, window.location.pathname); alert(`Conteggio per ${email} resettato.`); } } }
});
