document.addEventListener('DOMContentLoaded', function() {
    // =============================================================
    // --- 1. CONFIGURAZIONE E VARIABILI GLOBALI ---
    // =============================================================
    const sheetApiUrl = 'https://script.google.com/macros/s/AKfycbw666DGD4BlSHuJwmVYcRLF9_qMJX2LXy_r6gCGVbjR_dXQDngQU-JttofSKOwUkIJZ/exec?source=jukebox';
    const STRIPE_PUBLISHABLE_KEY = "pk_test_51S0GLJLyZ8FXl87PPrgWhBO9RP4ERXMcwT3KQ65JVOYRwYXFsBSohEM7tZE1yDFPusNPcqHK3Ivk8FSNYyj7TdkK00Jeb1SEET"; 
    
    const ADDON_PRICE_IDS = {
        siae: "price_1S5NN8LyZ8FXl87PRrpQOXDm",
        video: "price_1S5QcrLyZ8FXl87PipiY314W",
    };
    const ADDON_PRICES = { siae: 100, video: 49 };

    const MAX_PLAYS = 3;
    let allSongs = [];
    let shoppingCart = [];

    // Riferimenti DOM
    const songListContainer = document.getElementById('song-list-container');
    const cartBanner = document.getElementById('cart-banner');
    const cartItemsList = document.getElementById('cart-items-list');
    const cartTotalEl = document.getElementById('cart-total');

    // =============================================================
    // --- 2. NUOVA LOGICA DEL CARRELLO ---
    // =============================================================
    function openAddToCartModal(songData) {
        const modal = document.getElementById('add-to-cart-modal');
        const modalContent = document.getElementById('add-to-cart-modal-content');
        const basePrice = parseFloat(songData.prezzo);

        let optionsHTML = `
            <div class="upsell-item" data-price="${ADDON_PRICES.siae}" data-id="add-siae">
                <i class="fas fa-check-circle check-icon"></i>
                <div class="upsell-item-details">
                    <strong>Aggiungi Gestione Diritti SIAE</strong>
                    <span>Include il deposito dell'opera e la gestione burocratica completa (+${ADDON_PRICES.siae.toFixed(2)}€).</span>
                </div>
            </div>`;

        if (songData.videolink && songData.videolink.trim() !== '' && songData.videolink.toUpperCase() !== 'FALSE') {
            optionsHTML += `
                <div class="upsell-item" data-price="${ADDON_PRICES.video}" data-id="add-video">
                    <i class="fas fa-check-circle check-icon"></i>
                    <div class="upsell-item-details">
                        <strong>Aggiungi Video Promozionale</strong>
                        <span>Un video ottimizzato per i tuoi canali social (+${ADDON_PRICES.video.toFixed(2)}€).</span>
                    </div>
                </div>`;
        }

        modalContent.innerHTML = `
            <h3>Aggiungi Opzioni per</h3>
            <p class="song-title-highlight">${songData.titolo}</p>
            <div class="upsell-options">${optionsHTML}</div>
            <div class="info-box">
                <strong>Nota Fiscale:</strong> La cessione di opere dell'ingegno è esente da IVA. Il prezzo indicato è l'imponibile su cui, se sei un soggetto con Partita IVA, dovrai versare la ritenuta d'acconto del 20%.
            </div>
            <div id="purchase-summary">
                <button id="confirm-add-to-cart-btn" class="add-to-cart-btn">Conferma e Aggiungi al Carrello</button>
            </div>
        `;
        
        modal.style.display = 'flex';
        
        const confirmBtn = document.getElementById('confirm-add-to-cart-btn');
        modalContent.querySelectorAll('.upsell-item').forEach(item => {
            item.addEventListener('click', () => item.classList.toggle('selected'));
        });

        confirmBtn.onclick = () => {
            const songToAdd = {
                id: songData.id,
                title: songData.titolo,
                price: basePrice,
                withSIAE: modalContent.querySelector('[data-id="add-siae"]').classList.contains('selected'),
                withVideo: modalContent.querySelector('[data-id="add-video"]')?.classList.contains('selected') || false
            };
            addToCart(songToAdd);
            modal.style.display = 'none';
        };
    }

    function addToCart(songToAdd) {
        const existingIndex = shoppingCart.findIndex(item => item.id === songToAdd.id);
        if (existingIndex > -1) {
            shoppingCart[existingIndex] = songToAdd;
        } else {
            shoppingCart.push(songToAdd);
        }
        renderCart();
    }

    function removeFromCart(songId) {
        shoppingCart = shoppingCart.filter(item => item.id.toString() !== songId.toString());
        renderCart();
    }

    function renderCart() {
        if (shoppingCart.length === 0) {
            cartBanner.classList.remove('visible');
            return;
        }

        cartItemsList.innerHTML = '';
        let total = 0;

        shoppingCart.forEach(item => {
            let itemTotal = item.price;
            let optionsText = [];
            if (item.withSIAE) {
                itemTotal += ADDON_PRICES.siae;
                optionsText.push('SIAE');
            }
            if (item.withVideo) {
                itemTotal += ADDON_PRICES.video;
                optionsText.push('Video');
            }
            total += itemTotal;

            const itemHTML = `
                <div class="cart-item">
                    <div class="cart-item-details">
                        <span class="title">${item.title}</span>
                        ${optionsText.length > 0 ? `<span class="options">+ ${optionsText.join(' & ')}</span>` : ''}
                    </div>
                    <div class="cart-item-price">${itemTotal.toFixed(2)}€</div>
                    <button class="cart-item-remove" data-id="${item.id}">&times;</button>
                </div>`;
            cartItemsList.innerHTML += itemHTML;
        });

        cartTotalEl.textContent = `Totale: ${total.toFixed(2)}€`;
        cartBanner.classList.add('visible');
    }

    // =============================================================
    // --- 3. LOGICA DI CHECKOUT ---
    // =============================================================
    function redirectToCheckout() {
        if (shoppingCart.length === 0) return;
        if (!STRIPE_PUBLISHABLE_KEY) {
            alert("Errore: Chiave Stripe non configurata.");
            return;
        }

        const lineItemsPayload = [];
        shoppingCart.forEach(item => {
            const unitAmount = Math.round(parseFloat(item.price) * 100);
            if (isNaN(unitAmount) || unitAmount <= 0) {
                alert(`Errore: Prezzo non valido per il brano "${item.title}".`);
                return;
            }
            lineItemsPayload.push({
                price_data: { currency: 'eur', product_data: { name: `Brano: ${item.title}` }, unit_amount: unitAmount },
                quantity: 1
            });
            if (item.withSIAE) {
                lineItemsPayload.push({ price: ADDON_PRICE_IDS.siae, quantity: 1 });
            }
            if (item.withVideo) {
                lineItemsPayload.push({ price: ADDON_PRICE_IDS.video, quantity: 1 });
            }
        });

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
        });
    }

    // =============================================================
    // --- 4. RENDER DEI BRANI E SETUP EVENTI ---
    // =============================================================
    function renderSongs(songsToRender) {
        songListContainer.innerHTML = '';
        if (songsToRender.length === 0) {
            songListContainer.innerHTML = '<p>Nessun brano corrisponde ai filtri selezionati.</p>';
            return;
        }
        
        songsToRender.forEach(song => {
            let count = 0;
            const playsLeft = MAX_PLAYS - count;
            const isLocked = playsLeft <= 0;
            let purchaseHTML = '';

            if (song.prezzo && String(song.prezzo).trim() !== '' && song.stato?.toLowerCase() !== 'venduto' && !isLocked) {
                purchaseHTML = `<button class="add-to-cart-btn">Aggiungi al carrello da ${parseFloat(song.prezzo).toFixed(2)}€</button>`;
            } else if (song.stato?.toLowerCase() === 'venduto') {
                purchaseHTML = `<p style="color: #f44336; font-weight: bold; grid-column: 1 / -1;">Brano Venduto</p>`;
            }
            
            const hasLyrics = song.liriche && song.liriche.trim() !== "";
            const hasVideo = song.video_link && song.video_link.trim() !== '' && song.video_link.toUpperCase() !== 'FALSE';
            const songItem = document.createElement('div');
            songItem.className = `song-item ${isLocked ? 'disabled' : ''}`;
            
            Object.keys(song).forEach(key => {
                songItem.dataset[key.toLowerCase().replace(/_/g, '')] = song[key];
            });
            
            songItem.innerHTML = `
                <div class="song-item-top">
                    <div class="song-info">
                        <span class="title">${song.titolo}</span>
                        <div class="plays-left">Ascolti rimasti: ${playsLeft}</div>
                        <div class="song-details">
                          ${song.bpm ? `<span><i class="fas fa-tachometer-alt"></i> ${song.bpm} BPM</span>` : ''}
                          ${song.durata ? `<span><i class="far fa-clock"></i> ${song.durata}</span>` : ''}
                        </div>
                    </div>
                    <button class="btn info-btn top-row" title="Cosa include l'acquisto?"><i class="fas fa-info-circle"></i></button>
                </div>
                <div class="song-actions">
                    <button class="btn action-btn audio"><i class="fas fa-headphones"></i> Audio</button>
                    ${hasVideo ? `<button class="btn action-btn video"><i class="fas fa-film"></i> Video</button>` : '<div></div>'}
                    ${hasLyrics ? `<button class="btn action-btn lyrics"><i class="fas fa-file-lines"></i> Testo</button>` : '<div></div>'}
                    ${purchaseHTML}
                </div>`;
            songListContainer.appendChild(songItem);
        });
    }
    
    function setupEventListeners() {
        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('cart-checkout-btn').addEventListener('click', redirectToCheckout);

        cartItemsList.addEventListener('click', (e) => {
            if (e.target.classList.contains('cart-item-remove')) {
                removeFromCart(e.target.dataset.id);
            }
        });

        songListContainer.addEventListener('click', function(e) {
            const songItem = e.target.closest('.song-item');
            if (!songItem || songItem.classList.contains('disabled')) return;

            if (e.target.matches('.add-to-cart-btn')) {
                openAddToCartModal(songItem.dataset);
            }
        });
        
        document.querySelectorAll('.modal-overlay .modal-close').forEach(btn => btn.addEventListener('click', () => {
            btn.closest('.modal-overlay').style.display = 'none';
        }));
    }

    // =============================================================
    // --- 5. FUNZIONI CORE E HELPER ---
    // =============================================================
    async function handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('email-input').value.trim().toLowerCase();
        if (!email) return;
        const btn = e.target.querySelector('button');
        btn.textContent = 'Verifico...';
        btn.disabled = true;
        try {
            const res = await fetch(`${sheetApiUrl}&emailCheck=${encodeURIComponent(email)}`);
            if (!res.ok) throw new Error(`Network response was not ok: ${res.statusText}`);
            const result = await res.json();
            if (result.status === "ok" && result.name) {
                document.getElementById('login-screen').style.display = 'none';
                document.getElementById('jukebox-container').style.display = 'block';
                document.getElementById('client-name').textContent = result.name;
                await loadMusicFromApi(email);
            } else {
                alert(result.message || 'Accesso non autorizzato.');
            }
        } catch (err) {
            console.error("Login fetch error:", err);
            alert('Errore di comunicazione.');
        } finally {
            btn.textContent = 'Accedi';
            btn.disabled = false;
        }
    }

    async function loadMusicFromApi(userEmail) {
        songListContainer.innerHTML = `<p>Caricamento...</p>`;
        try {
            const res = await fetch(`${sheetApiUrl}&userEmail=${encodeURIComponent(userEmail)}`);
            if (!res.ok) throw new Error(`Network response was not ok: ${res.statusText}`);
            const data = await res.json();

            if (data && data.songs) {
                allSongs = data.songs;
                renderSongs(allSongs);
            } else {
                throw new Error("Formato dati non valido dalla API.");
            }
        } catch (err) {
            console.error("loadMusicFromApi error:", err);
            songListContainer.innerHTML = `<p style="color: #f44336;">Errore nel caricamento dei brani.</p>`;
        }
    }
    
    setupEventListeners();
});
