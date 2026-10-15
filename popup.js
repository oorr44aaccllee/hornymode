// popup.js
// Controla os switches do popup e mostra estatísticas (hmStats).
// Não usa mensagens; sincroniza diretamente com browser.storage.local.
// Comentários em português explicam decisões e comportamento.

/*
Decisões:
- O popup observa browser.storage.onChanged para refletir mudanças mesmo que
  ocorram por background/other tabs. Isso permite que a UI esteja sempre atualizada.
- Ao alterar um switch gravamos apenas a chave necessária em storage.local.
*/

document.addEventListener("DOMContentLoaded", function() {
  var hmOnEl = document.getElementById("hmOnSwitch");
  var hmHideAdsEl = document.getElementById("hmHideAdsSwitch");
  var hmAutoFillEl = document.getElementById("hmAutoFillSwitch");
  var countTotal = document.getElementById("countTotal");
  var countVisible = document.getElementById("countVisible");
  var countHidden = document.getElementById("countHidden");
  var countAt = document.getElementById("countAt");

  // defaults para população imediata
  hmOnEl.checked = true;
  hmHideAdsEl.checked = true;
  hmAutoFillEl.checked = true;

  function readAndRender() {
    try {
      browser.storage.local.get(["hmOn", "hmHideAds", "hmAutoFill", "hmStats"]).then(function(res) {
        try {
          if (typeof res.hmOn !== "undefined") {
            hmOnEl.checked = res.hmOn;
          }
          if (typeof res.hmHideAds !== "undefined") {
            hmHideAdsEl.checked = res.hmHideAds;
          }
          if (typeof res.hmAutoFill !== "undefined") {
            hmAutoFillEl.checked = res.hmAutoFill;
          }
          if (res.hmStats) {
            countTotal.textContent = String(res.hmStats.total || 0);
            countVisible.textContent = String(res.hmStats.visible || 0);
            countHidden.textContent = String(res.hmStats.hidden || 0);
            try {
              var d = new Date(res.hmStats.at || Date.now());
              countAt.textContent = d.toLocaleString();
            } catch (e) {
              countAt.textContent = String(res.hmStats.at || "-");
            }
          } else {
            countTotal.textContent = "-";
            countVisible.textContent = "-";
            countHidden.textContent = "-";
            countAt.textContent = "-";
          }
        } catch (e) {
          // render fallback
        }
      }).catch(function(e) {
        // storage read error: deixar defaults visíveis
      });
    } catch (e) {
      // ignore
    }
  }

  // inicializa valores
  readAndRender();

  // listeners dos switches -> gravar no storage
  hmOnEl.addEventListener("change", function() {
    try {
      browser.storage.local.set({ hmOn: Boolean(hmOnEl.checked) }).catch(function() {});
    } catch (e) {}
  });

  hmHideAdsEl.addEventListener("change", function() {
    try {
      browser.storage.local.set({ hmHideAds: Boolean(hmHideAdsEl.checked) }).catch(function() {});
    } catch (e) {}
  });

  hmAutoFillEl.addEventListener("change", function() {
    try {
      browser.storage.local.set({ hmAutoFill: Boolean(hmAutoFillEl.checked) }).catch(function() {});
    } catch (e) {}
  });

  // sincronizar mudanças externas
  try {
    browser.storage.onChanged.addListener(function(changes, area) {
      if (area !== "local") {
        return;
      }
      var relevant = false;
      if (changes.hmOn || changes.hmHideAds || changes.hmAutoFill || changes.hmStats) {
        relevant = true;
      }
      if (relevant) {
        readAndRender();
      }
    });
  } catch (e) {
    // ignore
  }
});
