

(function () {
      const grid = document.getElementById("dapps-grid");
      const metaCount = document.getElementById("meta-count");
      if (!Array.isArray(DAPPS) || !grid) return;

      metaCount.textContent = DAPPS.length + " dApps";

      const fragment = document.createDocumentFragment();

      DAPPS.forEach((dapp) => {
        const card = document.createElement("div");
        card.className = "card";

        const href = "./deployed/" + dapp.slug + "/";

        card.innerHTML = `
          <a href="${href}" target="_blank" rel="noopener noreferrer">
            <div class="card-header">
              <div class="card-title">${dapp.title}</div>
              <div class="card-tag">${dapp.tag}</div>
            </div>
            <div class="card-body">
              ${dapp.description}
            </div>
            <div class="card-footer">
              <div class="pill">
                <span class="pill-dot"></span>
                <span class="pill-text">Live dApp</span>
              </div>
              <span class="pill-chain">${dapp.chain}</span>
            </div>
          </a>
        `;

        fragment.appendChild(card);
      });

      grid.appendChild(fragment);
    })();